NOTIVA - iServe Integration Module

==================================



PURPOSE



Modul ini digunakan untuk membangun

integrasi NOTIVA dengan iServe / Odoo.



Modul harus dikembangkan secara TERPISAH

dari fitur NOTIVA yang saat ini sudah berjalan.





==================================================

SAFETY RULES

==================================================



1\. Jangan mengubah existing Reminder flow.



2\. Jangan mengubah existing Blast flow.



3\. Jangan mengubah existing Inbox flow.



4\. Jangan mengubah existing Analysis flow.



5\. Jangan mengubah existing Job Processor.



6\. Jangan mengubah existing WhatsApp Sender.



7\. Jangan mengubah existing Contact Database.



8\. Jangan langsung menulis data iServe

&#x20;  ke tabel contacts.



9\. Jangan langsung menulis data iServe

&#x20;  ke contact\_databases.



10\. Jangan langsung menulis data iServe

&#x20;   ke reminder\_schedules.



11\. Jangan langsung membuat send\_jobs.



12\. Jangan langsung membuat send\_job\_items.



13\. Jangan langsung mengirim WhatsApp.



14\. Semua data iServe harus menggunakan

&#x20;   tabel dengan prefix:



&#x20;   iserve\_



15\. Semua integration feature harus

&#x20;   memiliki feature flag.



16\. Default seluruh feature flag

&#x20;   adalah DISABLED.



17\. Raw iServe data harus masuk terlebih dahulu

&#x20;   ke isolated iServe storage.



18\. Audience harus dibentuk di iServe module.



19\. Publish audience ke existing NOTIVA

&#x20;   merupakan proses terpisah dan eksplisit.



20\. Existing NOTIVA tidak boleh bergantung

&#x20;   kepada iServe module.



21\. Jika iServe module error,

&#x20;   Reminder, Blast, Inbox, Analysis,

&#x20;   WhatsApp, dan Jobs existing

&#x20;   harus tetap bekerja.



22\. Penambahan menu Sidebar dilakukan

&#x20;   setelah isolated module stabil.



23\. Perubahan terhadap existing NOTIVA

&#x20;   harus dibuat sebagai tahap implementasi

&#x20;   terpisah.





==================================================

INITIAL MODULE STATUS

==================================================



ISERVE\_ENABLED=false



ISERVE\_SYNC\_ENABLED=false



ISERVE\_WEBHOOK\_ENABLED=false



ISERVE\_REMINDER\_ENABLED=false



ISERVE\_MARKETING\_ENABLED=false





==================================================

INITIAL ARCHITECTURE

==================================================



iServe / Odoo

&#x20;     |

&#x20;     X

&#x20;     |

NOTIVA iServe Module

&#x20;     |

&#x20;     X

&#x20;     |

Existing NOTIVA





Tidak ada koneksi aktif pada tahap awal.

