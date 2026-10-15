import { useEffect } from 'react'
import Head from 'next/head'

function getSafeImageUrl(value) {
  const raw = String(value || '').trim()

  if (!raw) return ''

  try {
    const parsed = new URL(raw)

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return ''
    }

    return parsed.toString()
  } catch (error) {
    return ''
  }
}

function getImageOrigin(value) {
  try {
    return new URL(value).origin
  } catch (error) {
    return ''
  }
}

function hideViewerBellOnce() {
  if (typeof document === 'undefined') return

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], a')
  )

  for (const candidate of candidates) {
    const label = [
      candidate.textContent,
      candidate.getAttribute('aria-label'),
      candidate.getAttribute('title')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (
      !label.includes('🔔') &&
      !label.includes('notification') &&
      !label.includes('notifikasi')
    ) {
      continue
    }

    const rect = candidate.getBoundingClientRect()

    const nearTopRight =
      rect.top >= -20 &&
      rect.top < 220 &&
      rect.right > Math.max(0, viewportWidth - 220)

    if (!nearTopRight) continue

    let target = candidate

    for (let depth = 0; depth < 4 && target?.parentElement; depth += 1) {
      const style = window.getComputedStyle(target)

      if (style.position === 'fixed' || style.position === 'absolute') {
        break
      }

      target = target.parentElement
    }

    target.style.setProperty('display', 'none', 'important')
  }
}

export default function ResponsiveImageViewer({ imageUrl }) {
  const imageOrigin = getImageOrigin(imageUrl)

  useEffect(() => {
    // Bell di-hide dengan beberapa lightweight one-shot attempts.
    // Tidak memakai MutationObserver / scan terus-menerus.
    hideViewerBellOnce()

    const timer1 = window.setTimeout(hideViewerBellOnce, 250)
    const timer2 = window.setTimeout(hideViewerBellOnce, 900)

    return () => {
      window.clearTimeout(timer1)
      window.clearTimeout(timer2)
    }
  }, [])

  return (
    <>
      <Head>
        <title>Image Viewer</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="robots" content="noindex,nofollow" />

        {imageOrigin ? (
          <>
            <link rel="preconnect" href={imageOrigin} />
            <link rel="dns-prefetch" href={imageOrigin} />
          </>
        ) : null}

        {imageUrl ? (
          <link rel="preload" as="image" href={imageUrl} />
        ) : null}
      </Head>

      <main className="viewer">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Preview"
            className="responsiveImage"
            referrerPolicy="no-referrer"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <div className="state">URL gambar tidak valid atau belum diberikan.</div>
        )}
      </main>

      <style jsx>{`
        :global(html),
        :global(body),
        :global(#__next) {
          margin: 0;
          width: 100%;
          min-height: 100%;
          background: #0b0b0b;
        }

        :global(body) {
          overflow: auto;
          -webkit-text-size-adjust: 100%;
        }

        .viewer {
          box-sizing: border-box;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: #0b0b0b;
          overflow: auto;
        }

        .responsiveImage {
          display: block;
          width: auto;
          height: auto;
          max-width: 100vw;
          max-height: 100vh;
          max-height: 100dvh;
          object-fit: contain;
          object-position: center center;
        }

        .state {
          max-width: 90vw;
          padding: 20px;
          color: white;
          font-family: Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          text-align: center;
        }
      `}</style>
    </>
  )
}

export async function getServerSideProps(context) {
  const rawSource = Array.isArray(context.query.src)
    ? context.query.src[0]
    : context.query.src

  const imageUrl = getSafeImageUrl(rawSource)

  context.res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=3600'
  )

  return {
    props: {
      imageUrl
    }
  }
}
