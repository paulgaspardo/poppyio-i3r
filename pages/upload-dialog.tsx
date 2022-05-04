import Head from "next/head";
import { PeerOffer, ModalService } from "poppyio";
import { FormEvent, useCallback, useEffect, useState } from "react";

export default function UploadDialog() {
   let [viewLink, setViewLink] = useState<string>();
   let [deleteLink, setDeleteLink] = useState<string>();

   let setLinks = useCallback((viewLink: string, deleteLink: string) => {
      setViewLink(viewLink);
      setDeleteLink(deleteLink);
   }, []);

   return <>
      <Head>
         <title>Poppy.io i3r</title>
      </Head>
      <div id="body">
         <h1><strong>Poppy.io i3r</strong> anonymous imgur upload</h1>
         {
            (viewLink || deleteLink)
            ? <UploadResult viewLink={viewLink} deleteLink={deleteLink}/>
            : <UploadForm setLinks={setLinks}/>
         }
      </div>
   </>
}

function UploadForm(props: { setLinks: (viewLink: string, deleteLink: string) => void }) {
   let { setLinks } = props;
   let [message, setMessage] = useState('Waiting for request...');
   let [imageBlob, setImageBlob] = useState<Blob>();
   let [hasValidImage, setHasValidImage] = useState(false);

   let [title, setTitle] = useState('');
   let [description, setDescription] = useState('');
   let [completeRequest, setCompleteRequest] = useState<(viewLink: string, deleteLink: string)=>void>();

   let [working, setWorking] = useState(false);

   useEffect(() => {
      let resolveExchange: (() => void) | undefined;
      ModalService.getRequest().then(async request => {
         if (!request) {
            setMessage('No request detected; this page should be opened from a poppy');
            return;
         }
         let result = await request.open({
            accepting: 'content-blob',
            using: (offer: PeerOffer) => new Promise<void>(resolve => {
               let envelope = offer.data[0];
               if (envelope && envelope.blob instanceof Blob) {
                  setImageBlob(envelope.blob);
                  setCompleteRequest(() => async (viewLink: string, deleteLink: string) => {
                     await offer.postResult({
                        links: [
                           { title: 'View Image', href: viewLink },
                           { title: 'Delete Image', href: deleteLink }
                        ]
                     });
                     setLinks(viewLink, deleteLink);
                     resolve();
                  });
                  if (typeof envelope.title === 'string') {
                     setTitle(envelope.title);
                  }
                  if (typeof envelope.description === 'string') {
                     setDescription(envelope.description);
                  }
               } else {
                  setMessage('')
               }
            })
         })
         if (!result.matched) {
            setMessage('Client is not compatible; expecting a content-blob offer');
         }
      });
      return () => { if (resolveExchange) resolveExchange() }
   }, [setLinks]);
   useEffect(() => {
      if (imageBlob) {
         setMessage('Generating thumbnail...');
         setHasValidImage(false);
      }
   }, [imageBlob]);
   let thumbnailLoaded = () => {
      setMessage('Ready for upload');
      setHasValidImage(true);
   };
   let thumbnailFailed = () => {
      setMessage('Image failed to load; probably not supported');
   };

   let performUpload = async (ev: FormEvent) => {
      ev.preventDefault();
      setWorking(true);
      let completed = false;
      try {
         let body = new FormData();
         body.append('image', imageBlob!);
         if (title) body.append('title', title);
         if (description) body.append('description', description);
         let res = await fetch('/api/imgur/upload', {
            method: 'POST',
            body
         });
         if (res.status === 503) {
            try {
               let json = await res.json();
               if (json && typeof json.retryIn === 'number') {
                  setMessage('Rate limited... maybe try again in ' + json.retryIn + ' seconds');
                  return;
               }
            } catch (e) {
               // ignore
            }
            setMessage('Server too busy right now');
            return;
         } else if (res.status !== 200) {
            setMessage('Error - HTTP ' + res.status + ' ' + res.statusText);
            return;
         }
         let { data } = await res.json();
         completed = true;
         completeRequest!(data.link, 'https://imgur.com/delete/' + data.deletehash);
      } catch (e: any) {
         console.error(e);
         setMessage('There was an error');
      } finally {
         setWorking(completed);
      }
   };

   let disabled = working || !hasValidImage;
   let disabledClass = disabled ? 'disabled' : undefined;

   return <div id="uploader">
      <div id="message">{message}</div>
      <div id="image"><BlobThumbnail blob={imageBlob} onLoad={thumbnailLoaded} onError={thumbnailFailed}/></div>
      <form id="mform" onSubmit={performUpload}>
         <fieldset className={disabledClass}>
            <label htmlFor="title">Title</label>
            <input id="title" disabled={disabled} type="text" value={title} onChange={e => setTitle(e.target.value)}/>
         </fieldset>
         <fieldset className={disabledClass}>
            <label htmlFor="description">Description</label>
            <textarea id="description" disabled={disabled} value={description} onChange={e => setDescription(e.target.value)}/>
         </fieldset>
         <div id="buttons">
            <button className={disabledClass} disabled={disabled} type="submit">upload to imgur</button>
            {" "}
            <button type="button" className="close" onClick={() => ModalService.close()}>cancel - close and return to client</button>
         </div>
      </form>
   </div>;
}

function BlobThumbnail(props: { blob: Blob|undefined, onLoad?: () =>void, onError?: () => void } ) {
   let { blob, onLoad, onError } = props;
   let [url, setUrl] = useState<string|undefined>();
   useEffect(() => {
      if (blob) {
         let url = URL.createObjectURL(blob);
         setUrl(url);
         return () => URL.revokeObjectURL(url);
      }
   }, [blob]);
   if (url) {
      return <img alt="Offered Image" src={url} style={{maxWidth: '150px', maxHeight: '150px'}} onLoad={onLoad} onError={onError}/>
   } else {
      return null;
   }
}

function UploadResult(props: { viewLink: string|undefined, deleteLink: string|undefined }) {
   return <div id='afterUpload'>
      <p>Your image was uploaded successfully.</p>
      <p>These links were sent back to the client, but in case you don&apos;t see them there:</p>
      <p>You can view it on imgur at <code>{props.viewLink}</code></p>                        
      <p>Save this link if you want to delete the image: <code>{props.deleteLink}</code></p>
      <button className='close' onClick={() => ModalService.close()}>done - close and return to client</button>
   </div>;
}
