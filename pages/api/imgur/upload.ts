import { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";

const clientId = process.env.IMGUR_CLIENT_ID;

export const config = {
   api: {
      bodyParser: false
   }
};

let uploadLoopRunning = false;
let uploadQueue: [NextApiRequest,NextApiResponse][] = [];
let uploadsRemaining = 0;
let nextCreditCheckAt = 0;

function updateUploadsRemaining(clientRemaining: any, postRemaining: any, postsReset: any, userRemaining: any, userReset: any) {
   console.log(Date.now(), 'updating uploads remaining from', clientRemaining, postRemaining, postsReset, userRemaining, userReset);
   uploadsRemaining = Math.floor(parseInt(clientRemaining || '0') / 10);
   uploadsRemaining = Math.min(uploadsRemaining, Math.floor(parseInt(userRemaining || '0') / 10));   
   if (postRemaining) {
      uploadsRemaining = Math.min(uploadsRemaining, parseInt(postRemaining || '0'));
   }
   nextCreditCheckAt = Date.now() + parseInt(postsReset || '0') * 1000;
   nextCreditCheckAt = Math.min(nextCreditCheckAt, parseInt(userReset || '0') * 1000);
   console.log('now', uploadsRemaining, nextCreditCheckAt);
}

export default async function upload(req: NextApiRequest, res: NextApiResponse) {
   uploadQueue.push([req, res]);
   if (uploadLoopRunning) {
      return;
   }
   try {
      uploadLoopRunning = true;
      while (uploadQueue.length > 0) {
         let batch = uploadQueue;
         uploadQueue = [];
         for (let [req, res] of batch) {
            try {
               if (uploadsRemaining <= 0 && Date.now() >= nextCreditCheckAt) {
                  console.log('needs credit check');
                  try {
                     let creditCheck = await fetch('https://api.imgur.com/3/credits', {
                        headers: {
                           authorization: 'Client-ID ' + clientId
                        }
                     });
                     creditCheck.headers.forEach((val, key) => {
                        console.log(key, val);
                     });
                     if (creditCheck.status !== 200) {
                        throw new Error('https://api.imgur.com/3/credits returned ' + creditCheck.status);
                     }
                     let { data } = await creditCheck.json();
                     updateUploadsRemaining(
                        data.ClientRemaining,
                        null,
                        null,
                        data.UserRemaining,
                        data.UserReset
                     );
                  } catch (e) {
                     console.error(e);
                     nextCreditCheckAt = Date.now() + 15 * 60 * 1000;
                  }
               }
               if (uploadsRemaining < 0) {
                  console.log('reached upload limit');
                  res.status(503).send({ retryIn: Math.floor((nextCreditCheckAt - Date.now())/1000 + Math.random() * 60 ) });
               } else {
                  uploadsRemaining--;
                  let uploadHeaders = await handleUpload(req, res);
                  if (uploadHeaders) {
                     updateUploadsRemaining(
                        uploadHeaders.get('x-ratelimit-clientremaining'),
                        uploadHeaders.get('x-post-rate-limit-remaining'),
                        uploadHeaders.get('x-post-rate-limit-reset'),
                        uploadHeaders.get('x-ratelimit-userremaining'),
                        uploadHeaders.get('x-ratelimit-userreset')
                     );
                  }
               }
            } catch (e) {
               console.error('upload failed', e);
               res.status(500).send('internal error');
            }
         }
      }
      uploadLoopRunning = false;
   } catch (e) {
      console.error('uncaught error in upload loop', e);
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
      console.log('responseText', responseText);
      res.status(200);
      res.setHeader('content-type', uploadResult.headers.get('content-type')!);
      res.send(responseText);
      return uploadResult.headers;
   } catch (e) {
      console.error('exception in upload', e);
      res.status(500).send('caught exception');
   }
}