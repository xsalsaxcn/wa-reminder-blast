import Head from 'next/head'
import '../styles/globals.css'

const LOGO_URL = 'https://cdn.phototourl.com/free/2026-06-21-c4d82306-6ffd-4d1e-badb-95ea9484d1b9.jpg'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Notiva - WhatsApp Blast & Reminder</title>
        <meta
          name="description"
          content="Notiva adalah platform WhatsApp automation untuk blast, reminder, inbox, quick replies, dan monitoring komunikasi."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="Notiva - WhatsApp Blast & Reminder" />
        <meta
          property="og:description"
          content="Kelola WhatsApp blast, reminder, inbox, quick replies, dan job queue dalam satu platform."
        />
        <meta property="og:image" content={LOGO_URL} />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Notiva - WhatsApp Blast & Reminder" />
        <meta
          name="twitter:description"
          content="WhatsApp automation platform untuk reminder, blast, dan inbox."
        />
        <meta name="twitter:image" content={LOGO_URL} />
      </Head>

      <Component {...pageProps} />
    </>
  )
}