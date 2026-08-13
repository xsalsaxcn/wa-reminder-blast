/**
 * NOTIVA - iServe Data Normalizer
 *
 * File ini hanya menangani normalisasi data.
 *
 * Tidak membaca database.
 * Tidak menulis database.
 * Tidak mengirim WhatsApp.
 * Tidak berinteraksi dengan fitur NOTIVA existing.
 */


/**
 * Normalize nomor Indonesia ke format:
 *
 * 628xxxxxxxxxx
 *
 * Contoh:
 *
 * 08123456789
 * +628123456789
 * '08123456789
 * ="08123456789"
 *
 * menjadi:
 *
 * 628123456789
 */
export function normalizePhone(value) {
  if (!value) {
    return null
  }

  let phone = String(value)
    .trim()
    .replace(/^'/, '')
    .replace(/^="/, '')
    .replace(/"$/, '')
    .replace(/\D/g, '')

  if (!phone) {
    return null
  }

  if (phone.startsWith('0')) {
    phone = `62${phone.slice(1)}`
  }

  if (phone.startsWith('8')) {
    phone = `62${phone}`
  }

  if (!phone.startsWith('62')) {
    return null
  }

  if (phone.length < 10) {
    return null
  }

  return phone
}


/**
 * Normalize patient dari response iServe.
 *
 * NIK sengaja TIDAK dimasukkan
 * karena tidak dibutuhkan oleh NOTIVA
 * untuk reminder/marketing.
 */
export function normalizePatient(patient = {}) {
  return {
    externalPatientId:
      patient.patientId ??
      patient.id ??
      null,

    name:
      patient.name ??
      patient.fullName ??
      null,

    phoneRaw:
      patient.phone ??
      null,

    phone:
      normalizePhone(
        patient.phone
      ),

    email:
      patient.email ??
      null
  }
}


/**
 * Normalize appointment dari response iServe.
 */
export function normalizeAppointment(
  appointment = {}
) {
  return {
    externalAppointmentId:
      appointment.id ??
      null,

    externalPatientId:
      appointment.patient?.id ??
      appointment.patientId ??
      null,

    startAt:
      appointment.startTime ??
      null,

    endAt:
      appointment.endTime ??
      null,

    timezone:
      appointment.timezone ??
      'Asia/Jakarta',

    status:
      appointment.status ??
      null,

    canceled:
      Boolean(
        appointment.canceled
      ),

    appointmentTypeId:
      appointment.appointmentTypeId ??
      null,

    duration:
      appointment.duration ??
      null,

    calendarId:
      appointment.calendarId ??
      null,

    calendarName:
      appointment.calendar ??
      null,

    location:
      appointment.location ??
      null
  }
}


/**
 * Mengecek apakah appointment
 * secara umum masih future/upcoming.
 *
 * Ini BELUM merupakan rule reminder.
 */
export function isFutureAppointment(
  appointment,
  now = new Date()
) {
  if (!appointment?.startAt) {
    return false
  }

  const start =
    new Date(appointment.startAt)

  if (
    Number.isNaN(
      start.getTime()
    )
  ) {
    return false
  }

  return start > now
}