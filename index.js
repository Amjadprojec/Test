const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  Browsers
} = require("@whiskeysockets/baileys")
const pino = require('pino')
const qrcode = require("qrcode-terminal")
const readline = require('readline')
const { Boom } = require('@hapi/boom')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })

// Fungsi untuk input user
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

// Fungsi utama
async function start() {
  console.clear()
  console.log('╔══════════════════════════════════════════╗')
  console.log('║          WHATSAPP BOT CONNECTION         ║')
  console.log('╚══════════════════════════════════════════╝\n')
    
  // Tanya user mau pakai QR atau pairing code
  const usePairingCode = await question('Pilih metode koneksi:\n1. QR Code (y)\n2. Pairing Code (n)\nPilih (y/n): ')
    
  let pairingCode = false
  if (usePairingCode.toLowerCase() === 'n') {
    pairingCode = true
    console.log('\nAnda memilih Pairing Code')
  } else {
    console.log('\nAnda memilih QR Code')
  }
    
  const { state, saveCreds } = await useMultiFileAuthState('./session')
    
  const sock = makeWASocket({
    browser: Browsers.ubuntu("Firefox"),
    generateHighQualityLinkPreview: true,
    printQRInTerminal: !pairingCode, // QR hanya tampil jika tidak pakai pairing
    auth: state,
    logger: pino({ level: 'silent' })
  })

  // Jika pakai pairing code
  if (pairingCode && !sock.authState.creds.registered) {
    let phoneNumber = await question('\nMasukkan nomor WhatsApp (contoh: 628123456789): ')
    phoneNumber = phoneNumber.replace(/[^0-9]/g, "")
        
    if (!phoneNumber.startsWith('628')) {
      console.log('Nomor harus diawali dengan 628 (Indonesia)')
      process.exit(1)
    }
    try {
      const code = await sock.requestPairingCode(phoneNumber)
      console.log(`\n╔══════════════════════════════════════════╗`)
      console.log(`║          PAIRING CODE BERHASIL            ║`)
      console.log(`╚══════════════════════════════════════════╝`)
      console.log(`\nKode Pairing: ${code}`)
      console.log('\nInstruksi:')
      console.log('1. Buka WhatsApp di ponsel Anda')
      console.log('2. Pilih Settings/Linked Devices')
      console.log('3. Pilih Link a Device')
      console.log('4. Masukkan kode pairing di atas')
      console.log('\nMenunggu konfirmasi...')
    } catch (error) {
      console.log('Gagal mendapatkan pairing code:', error.message)
      process.exit(1)
    }
  }

  store?.bind(sock.ev)
  sock.ev.on('creds.update', saveCreds)
    
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    // Tampilkan QR jika tidak pakai pairing
    if (qr && !pairingCode) {
      console.clear()
      console.log('╔══════════════════════════════════════════╗')
      console.log('║           SCAN QR CODE BERIKUT           ║')
      console.log('║      UNTUK MENGHUBUNGKAN KE WHATSAPP     ║')
      console.log('╚══════════════════════════════════════════╝\n')
      //qrcode.generate(qr, { small: true })
      console.log('\nInstruksi:')
      console.log('1. Buka WhatsApp di ponsel Anda')
      console.log('2. Pilih Settings/Linked Devices')
      console.log('3. Pilih Link a Device')
      console.log('4. Scan QR code di atas')
      console.log('\nMenunggu scan...')
    }
    if (connection === 'open') {
      console.clear()
      console.log('╔══════════════════════════════════════════╗')
      console.log('║      BOT BERHASIL TERHUBUNG KE WA!       ║')
      console.log('╚══════════════════════════════════════════╝')
      console.log(`\n👤 User: ${sock.user.name}`)
      console.log(`📱 WhatsApp: ${sock.user.id.split(':')[0]}`)
      console.log(`🆔 JID: ${sock.user.id}`)
      console.log('\nBot sedang berjalan...')
      // Tutup readline setelah terhubung
      rl.close()
    }
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log('\nKoneksi terputus...')
      if (reason === DisconnectReason.loggedOut) {
        console.log("Akun ter-logout, silakan scan/hubungkan lagi")
        process.exit()
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log("Koneksi diganti oleh sesi lain")
        process.exit()
      } else {
        console.log("Mencoba menyambung kembali...")
        setTimeout(() => start(), 3000)
      }
    }
  })

  // Event untuk menerima pesan
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message || msg.key.fromMe) return
    
    const from = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
    console.log(`\n📩 Pesan dari ${from}: ${text}`)
    // Contoh command
    if (text.toLowerCase() === '!menu') {
      const menu = `*📱 BOT MENU*\n\n` + `!menu - Tampilkan menu ini\n` + `!ping - Test koneksi bot\n` + `!owner - Info pemilik bot\n` + `!time - Waktu saat ini`
      await sock.sendMessage(from, { text: menu })
    }
    if (text.toLowerCase() === '!ping') {
      await sock.sendMessage(from, { text: '🏓 Pong!' })
    }
        
    if (text.toLowerCase() === '!owner') {
      await sock.sendMessage(from, { text: 'Owner: WhatsApp Bot Developer\nHubungi: owner@example.com' })
    }
        
    if (text.toLowerCase() === '!time') {
      const now = new Date()
      const timeString = now.toLocaleString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
      })
      await sock.sendMessage(from, { text: `🕒 Waktu saat ini: ${timeString}` })
    }
  })
    
 // Event untuk melihat status koneksi
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'connecting') {
      console.log('\nSedang menghubungkan...')
    }
  })
}

// Handle error dan exit
process.on('uncaughtException', (err) => {
    console.error('Terjadi error:', err)
})

process.on('SIGINT', () => {
    console.log('\n\nBot dihentikan oleh pengguna')
    rl.close()
    process.exit(0)
})

// Jalankan bot
console.clear();
start().catch(err => {
    console.error('Error saat menjalankan bot:', err)
    rl.close()
    process.exit(1)
})
