import { Html, Head, Main, NextScript } from 'next/document'

const LOGO_URL = 'https://cdn.phototourl.com/free/2026-06-21-c4d82306-6ffd-4d1e-badb-95ea9484d1b9.jpg'

export default function Document() {
return (
<Html lang="id">
<Head>
<link rel="icon" href={LOGO_URL} />
<link rel="apple-touch-icon" href={LOGO_URL} />
<meta name="theme-color" content="#0F172A" />
<meta name="application-name" content="Notiva" />
</Head>
<body>
<Main />
<NextScript />
</body>
</Html>
)
}