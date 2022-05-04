import { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";

const clientId = process.env.IMGUR_CLIENT_ID;

export const config = {
  api: {
    bodyParser: false
  }
};

let uploadsAllowed = 0;
let nextCreditCheckAt = 0;
function updateRateLimitInfo(responseHeadersOrCreditsApiData: {get(key:string):string|null|undefined}) {
  let get = (key: string) => responseHeadersOrCreditsApiData.get(key) || responseHeadersOrCreditsApiData.get('x-ratelimit-' + key.toLowerCase());
  uploadsAllowed = Math.floor(parseInt(get('ClientRemaining') || '0') / 10);
  uploadsAllowed = Math.min(uploadsAllowed, Math.floor(parseInt(get('UserRemaining') || '0') / 10));
  let postsRemaining = get('x-post-rate-limit-remaining');
  if (typeof postsRemaining === 'string') {
    uploadsAllowed = Math.min(uploadsAllowed, parseInt(postsRemaining));
  }
  nextCreditCheckAt = Date.now() + parseInt(get('x-post-rate-limit-reset') || '0') * 1000;
  nextCreditCheckAt = Math.min(nextCreditCheckAt, parseInt(get('UserReset') || '0') * 1000);
  console.log('now', uploadsAllowed, nextCreditCheckAt);
}

let uploadQueue: [NextApiRequest,NextApiResponse][] = [];
export default function upload(req: NextApiRequest, res: NextApiResponse) {
  return new Promise<void>(resolve => {
    res.on('close', resolve);
    uploadQueue.push([req, res]);
    startUploadFiberIfNotRunning();
  });
}

let uploadFiberRunning = false;
async function startUploadFiberIfNotRunning() {
  if (uploadFiberRunning) {
    return;
  }
  try {
    uploadFiberRunning = true;
    while (uploadQueue.length > 0) {
      let batch = uploadQueue;
      uploadQueue = [];
      for (let [req, res] of batch) {
        try {
          if (uploadsAllowed <= 0 && Date.now() >= nextCreditCheckAt) {
            console.log('needs credit check');
            try {
              let creditCheck = await fetch('https://api.imgur.com/3/credits', {
                headers: {
                  authorization: 'Client-ID ' + clientId
                }
              });
              if (creditCheck.status !== 200) {
                throw new Error('https://api.imgur.com/3/credits returned ' + creditCheck.status);
              }
              let { data } = await creditCheck.json();
              updateRateLimitInfo(new Map(Object.entries(data as {[key:string]:string})));
            } catch (e) {
              console.error(e);
              nextCreditCheckAt = Date.now() + 15 * 60 * 1000;
            }
          }
          if (uploadsAllowed <= 0) {
            console.log('reached upload limit');
            res.status(503).send({ retryIn: Math.floor((nextCreditCheckAt - Date.now())/1000 + Math.random() * 60 ) });
          } else {
            uploadsAllowed--;
            let uploadHeaders = await handleUpload(req, res);
            if (uploadHeaders) {
              updateRateLimitInfo(uploadHeaders);
            }
          }
        } catch (e) {
          console.error('upload failed', e);
          res.status(500).send('internal error');
        }
      }
    }
    uploadFiberRunning = false;
  } catch (e) {
    console.error('uncaught error in upload fiber', e);
    process.exit(1);
  }
}

async function handleUpload(req: NextApiRequest, res: NextApiResponse): Promise<Headers|undefined> {
  try {
    if (!clientId) {
      console.error('upload failed, no IMGUR_CLIENT_ID environment variable');
      res.status(500).send('no client id');
      return;
    }
    let uploadResult = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        "authorization": "Client-ID " + clientId,
        "content-type": req.headers["content-type"]!
      },
      body: await getRawBody(req)
    });
    if (uploadResult.status !== 200) {
      console.error('upload failed with ' + uploadResult.status);
      res.status(uploadResult.status).send('http error from imgur');
      let body = await uploadResult.text();
      console.error('from imgur: ' + body);
      return uploadResult.headers;
    }
    let responseText = await uploadResult.text();
    res.status(200);
    res.setHeader('content-type', uploadResult.headers.get('content-type')!);
    res.send(responseText);
    return uploadResult.headers;
  } catch (e) {
    console.error('exception in upload', e);
    res.status(500).send('caught exception');
  }
}