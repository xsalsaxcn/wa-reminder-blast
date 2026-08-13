import {
  useEffect,
  useState
} from 'react'


function StatusBadge({
  children,
  active = false
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 10px',
        borderRadius: '999px',
        background:
          active
            ? '#e8f5e9'
            : '#f5f5f5',
        border:
          active
            ? '1px solid #a5d6a7'
            : '1px solid #dddddd',
        fontSize: '12px',
        fontWeight: 600
      }}
    >
      {children}
    </span>
  )
}


function Card({
  title,
  children
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e6e6e6',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '18px'
      }}
    >
      <h2
        style={{
          marginTop: 0,
          fontSize: '18px'
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  )
}


export default function IServeHome() {
  const [health, setHealth] =
    useState(null)

  const [error, setError] =
    useState(null)

  const [loading, setLoading] =
    useState(true)


  useEffect(() => {
    loadHealth()
  }, [])


  async function loadHealth() {
    try {
      setLoading(true)
      setError(null)

      const response =
        await fetch(
          '/api/iserve/health'
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data?.message ||
          'Health check gagal'
        )
      }

      setHealth(data)

    } catch (err) {
      console.error(
        '[iServe UI health]',
        err
      )

      setError(
        err?.message ||
        'Gagal membaca status modul iServe'
      )

    } finally {
      setLoading(false)
    }
  }


  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f6f8',
        padding: '32px 20px'
      }}
    >

      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto'
        }}
      >

        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e6e6e6',
            borderRadius: '12px',
            padding: '28px',
            marginBottom: '18px'
          }}
        >

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'space-between',
              gap: '20px',
              flexWrap: 'wrap'
            }}
          >

            <div>
              <h1
                style={{
                  margin: 0,
                  marginBottom: '8px'
                }}
              >
                NOTIVA - iServe Integration
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: '760px',
                  lineHeight: 1.6
                }}
              >
                Isolated module untuk
                sinkronisasi, collection,
                analysis, reminder planning,
                dan marketing data
                dari iServe / Odoo.
              </p>
            </div>

            <StatusBadge
              active={
                health?.status ===
                'READY'
              }
            >
              {
                health?.status ||
                'CHECKING'
              }
            </StatusBadge>

          </div>

        </div>


        <Card title="Isolation Status">

          <p>
            Modul iServe dibuat terpisah
            dari Reminder, Blast, Inbox,
            Jobs, Analysis, dan
            WhatsApp Sender NOTIVA.
          </p>

          <p>
            Existing NOTIVA Integration:{' '}
            <strong>
              {
                health
                  ?.existingNotivaIntegration
                || 'NOT_CONNECTED'
              }
            </strong>
          </p>

        </Card>


        <Card title="Module Health">

          {loading && (
            <p>
              Checking module...
            </p>
          )}

          {error && (
            <div
              style={{
                padding: '12px',
                background: '#fff4f4',
                border:
                  '1px solid #ffc7c7',
                borderRadius: '8px'
              }}
            >
              {error}
            </div>
          )}

          {health && (
            <pre
              style={{
                overflowX: 'auto',
                padding: '16px',
                background: '#f6f6f6',
                borderRadius: '8px',
                lineHeight: 1.5
              }}
            >
              {
                JSON.stringify(
                  health,
                  null,
                  2
                )
              }
            </pre>
          )}

          <button
            type="button"
            onClick={loadHealth}
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '9px 16px',
              cursor:
                loading
                  ? 'not-allowed'
                  : 'pointer'
            }}
          >
            Refresh Status
          </button>

        </Card>


        <Card title="iServe Connection">

          <StatusBadge>
            DISABLED
          </StatusBadge>

          <p>
            Connection ke iServe
            belum dikonfigurasi.
          </p>

          <p>
            Belum ada request keluar
            dari NOTIVA menuju iServe.
          </p>

        </Card>


        <Card title="Data Sync">

          <StatusBadge>
            DISABLED
          </StatusBadge>

          <p>
            Automatic sync belum aktif.
          </p>

          <p>
            Database iServe juga belum
            dibuat pada tahap ini.
          </p>

        </Card>


        <Card title="Collected Data / Audience">

          <StatusBadge>
            DISABLED
          </StatusBadge>

          <p>
            Audience Collector belum aktif.
          </p>

          <p>
            Tidak ada data iServe
            yang masuk ke contacts
            atau contact databases
            NOTIVA.
          </p>

        </Card>


        <Card title="Programs">

          <div
            style={{
              display: 'grid',
              gap: '12px'
            }}
          >

            <div>
              Appointment Reminder:{' '}
              <strong>
                DISABLED
              </strong>
            </div>

            <div>
              Next Plan:{' '}
              <strong>
                DISABLED
              </strong>
            </div>

            <div>
              Reactivation:{' '}
              <strong>
                DISABLED
              </strong>
            </div>

            <div>
              Marketing:{' '}
              <strong>
                DISABLED
              </strong>
            </div>

          </div>

        </Card>


        <Card title="Safety">

          <p>
            Pada tahap ini modul
            TIDAK dapat:
          </p>

          <div
            style={{
              lineHeight: 1.9
            }}
          >
            Mengirim WhatsApp
            <br />

            Membuat Reminder
            <br />

            Membuat Blast
            <br />

            Membuat Send Job
            <br />

            Menulis ke contacts
            <br />

            Menulis ke reminder schedules
            <br />

            Menarik data iServe
          </div>

        </Card>

      </div>

    </div>
  )
}