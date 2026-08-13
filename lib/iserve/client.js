import { getIServeConfig } from './config'


/**
 * NOTIVA - iServe Integration Client
 *
 * SAFETY:
 * Modul iServe masih terisolasi.
 * Selama ISERVE_ENABLED bukan "true",
 * tidak ada request ke iServe yang boleh berjalan.
 */


/**
 * Memastikan integrasi iServe memang
 * diaktifkan secara eksplisit.
 */
export function assertIServeEnabled() {
  const config = getIServeConfig()

  if (!config.enabled) {
    throw new Error(
      'iServe integration is disabled'
    )
  }

  return config
}


/**
 * Placeholder request function.
 *
 * Pada tahap ini BELUM melakukan
 * request ke iServe / Odoo.
 *
 * Fungsi ini sengaja dihentikan
 * sampai connection layer kita
 * aktifkan pada tahap berikutnya.
 */
export async function iserveRequest() {
  assertIServeEnabled()

  throw new Error(
    'iServe API client belum dikonfigurasi'
  )
}


/**
 * Placeholder GET Patient.
 *
 * Nanti akan menggunakan:
 *
 * GET /api/patients/{patientId}
 */
export async function getIServePatient(patientId) {
  if (!patientId) {
    throw new Error(
      'patientId wajib diisi'
    )
  }

  return iserveRequest()
}


/**
 * Placeholder GET Appointment.
 *
 * Nanti akan menggunakan:
 *
 * GET /api/appointments/{appointmentId}
 */
export async function getIServeAppointment(
  appointmentId
) {
  if (!appointmentId) {
    throw new Error(
      'appointmentId wajib diisi'
    )
  }

  return iserveRequest()
}