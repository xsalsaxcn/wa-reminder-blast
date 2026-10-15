import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'


function hideFloatingNotificationBell() {
  if (typeof document === 'undefined') return

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0

  const candidates = Array.from(
    document.querySelectorAll('button, [role="button"], a, div')
  )

  for (const candidate of candidates) {
    const text = String(candidate.textContent || '').replace(/\s+/g, '')

    if (!text.includes('🔔')) continue

    const rect = candidate.getBoundingClientRect()
    const nearTopRight =
      rect.top >= -20 &&
      rect.top < 220 &&
      rect.right > Math.max(0, viewportWidth - 220)

    if (!nearTopRight) continue

    let node = candidate

    for (let depth = 0; depth < 5 && node; depth += 1) {
      const style = window.getComputedStyle(node)

      if (style.position === 'fixed' || style.position === 'absolute') {
        break
      }

      node = node.parentElement
    }

    const target = node || candidate
    const targetRect = target.getBoundingClientRect()
    const targetStyle = window.getComputedStyle(target)

    const isFloating =
      targetStyle.position === 'fixed' ||
      targetStyle.position === 'absolute' ||
      (
        targetRect.top < 220 &&
        targetRect.right > Math.max(0, viewportWidth - 220)
      )

    if (isFloating) {
      target.setAttribute('data-hidden-on-image-viewer', 'true')
      target.style.setProperty('display', 'none', 'important')
    }
  }
}

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

export default function ResponsiveImageViewer() {
  const router = useRouter()

  const imageUrl = useMemo(() => {
    return getSafeImageUrl(router.query.src)
  }, [router.query.src])

  const hasSource = Boolean(String(router.query.src || '').trim())

  useEffect(() => {
    hideFloatingNotificationBell()

    const bellObserver = new MutationObserver(() => {
      hideFloatingNotificationBell()
    })

    bellObserver.observe(document.body, {
      childList: true,
      subtree: true
    })

    const timer = window.setTimeout(() => {
      hideFloatingNotificationBell()
    }, 500)

    return () => {
      window.clearTimeout(timer)
      bellObserver.disconnect()
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
      </Head>

      <main className="viewer">
        {!router.isReady ? (
          <div className="state">Memuat gambar...</div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Preview"
            className="responsiveImage"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="state">
            {hasSource
              ? 'URL gambar tidak valid.'
              : 'URL gambar belum diberikan.'}
          </div>
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

        @media (orientation: portrait) {
          .responsiveImage {
            max-width: 100vw;
            max-height: 100dvh;
          }
        }

        @media (orientation: landscape) {
          .responsiveImage {
            max-width: 100vw;
            max-height: 100dvh;
          }
        }
      `}</style>
    </>
  )
}
