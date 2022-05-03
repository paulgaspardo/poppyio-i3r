import Head from "next/head";

export default function Uploader() {
   return <>
      <Head>
         <title>Poppy.io i3r</title>
      </Head>
      <div id="body">
         <h1><strong>Poppy.io i3r</strong> anonymous imgur upload</h1>
         <div id="uploader">
            <div id="message">waiting for app...</div>
            <div id="image" className="hidden"></div>
            <form id="mform">
               <fieldset className="disabled">
                  <label htmlFor="title">Title</label>
                  <input disabled={true} type="text" id="title"/>
               </fieldset>
               <fieldset className="disabled">
                  <label htmlFor="description">Description</label>
                  <textarea disabled={true} id="description"/>
               </fieldset>
               <div id="buttons">
                  <button className="disabled" disabled={true} type="submit">upload to imgur</button>
                  <button type="button" className="close">cancel - close and return to app</button>
               </div>
            </form>
         </div>
      </div>
   </>
}