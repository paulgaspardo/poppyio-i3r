import Head from "next/head";
import { PeerOffer, ModalService, ModalServiceRequest } from "poppyio";
import { EventHandler, FormEvent, FormEventHandler, useCallback, useEffect, useRef, useState } from "react";

export default function Uploader() {
   let [message, setMessage] = useState('Waiting for request...');
   let [title, setTitle] = useState('');
   let [description, setDescription] = useState('');

   let [performUpload, setPerformUpload] = useState<FormEventHandler[]>([]);
   let [uploadStatus, setUploadStatus] = useState<'before'|'during'|'after'>('before');

   let [viewLink, setViewLink] = useState<string|undefined>(undefined);
   let [deleteLink, setDeleteLink] = useState<string|undefined>(undefined);

   let thumbnailRef = useCallback(async (parent: HTMLDivElement) => {
      if (!parent) {
         return;
      }
      let request = await ModalService.getRequest();
      if (!request) {
         setMessage('No request received; this page must be opened in a poppy.')
         return;
      }
      let matchingIntent = request.matching.find(i => i.side === 'offering' && i.form === 'content-blob');
      if (!matchingIntent) {
         setMessage('Client not compatible with this service; expecting an offer for a content-blob');
         return;
      }
      let acceptHandler = (offer: PeerOffer) => new Promise<void>(resolve => {
         let envelope = offer.data[0];
         if (!envelope || !(envelope.blob instanceof Blob)) {
            setMessage('Received invalid message from client (no blob)');
            resolve();
            return;
         }
         if (typeof envelope.title === 'string') {
            setTitle(envelope.title);
         }
         if (typeof envelope.description === 'string') {
            setTitle(envelope.description);
         }
         setMessage('Generating thumbnail...');
         parent.innerHTML == '';

         let performUpload = async (ev: FormEvent) => {
            ev.preventDefault();
            setUploadStatus('during');
            setMessage('Uploading to imgur...');
            let result = await submitUpload(envelope.blob, title, description);
            if (typeof result === 'string') {
               setUploadStatus('before');
               setMessage('Unable to upload: ' + result);
            } else {
               setUploadStatus('after');
               setViewLink(result[0]);
               setDeleteLink(result[1]);
               offer.postResult({
                  links: [
                     {
                        title: 'View Image',
                        href: result[0]
                     },
                     {
                        title: 'Delete Image',
                        href: result[1]
                     }
                  ]
               });
               resolve();
            }
         };

         let img = new Image;
         img.style.maxWidth = '150px';
         img.style.maxHeight = '150px';
         img.onload = () => {
            setMessage('Ready to upload');
            parent.appendChild(img);
            URL.revokeObjectURL(img.src);
            setPerformUpload([performUpload]);
         };
         img.onerror = () => {
            setMessage('Failed to generate thumbnail; image appears invalid');
            URL.revokeObjectURL(img.src);
         };
         img.src = URL.createObjectURL(envelope.blob);
      });

      request.open({
         accepting: 'content-blob',
         using: acceptHandler
      });

   }, []);

   let disabled = !performUpload[0] || uploadStatus === 'during';
   let disabledClass = disabled ? 'disabled' : undefined;

   let uploader = <div id="uploader">
         <div id="message">{message}</div>
         <div id="image" ref={thumbnailRef}/>
         <form id="mform" onSubmit={performUpload[0]}>
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

   let afterUpload = <div id='afterUpload'>
      <p>Your image was uploaded successfully.</p>
      <p>These links were sent back to the client, but in case you don't see them there:</p>
      <p>You can view it on imgur at <code>{viewLink}</code></p>                        
      <p>Save this link if you want to delete the image: <code>{deleteLink}</code></p>
      <button className='close' onClick={() => ModalService.close()}>done - close and return to client</button>
   </div>

   return <>
      <Head>
         <title>Poppy.io i3r</title>
      </Head>
      <div id="body">
         <h1><strong>Poppy.io i3r</strong> anonymous imgur upload</h1>
         {uploadStatus === 'after' ? afterUpload : uploader}
      </div>
   </>
}

async function submitUpload(blob: Blob, title: string, description: string): Promise<string | [string, string]> {
   let sending = new FormData();
   sending.append('image', blob);
   if (title) {
      sending.append('title', title);
   }
   if (description) {
      sending.append('description', description);
   }
   let res = await fetch('/api/imgur/upload', {
      method: 'POST',
      body: sending
   });
   if (res.status === 503) {
      try {
         let json = await res.json();
         if (json && typeof json.retryIn === 'number') {
            return 'Too many requests at the moment, maybe try again in ' + json.retryIn + ' seconds';
         }
      } catch (e) {
         // ignore
      }
      return 'Server too busy right now';
   } else if (res.status !== 200) {
      return 'HTTP ' + res.status + ' ' + res.statusText;
   }
   let { data } = await res.json();
   return [data.link, 'https://imgur.com/delete/' + data.deletehash];
}