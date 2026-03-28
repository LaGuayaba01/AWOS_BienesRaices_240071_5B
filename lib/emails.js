import nodemailer from 'nodemailer'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import EmailQueue from '../models/EmailQueue.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const transport = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    // Pool de conexiones — reutiliza la conexión SMTP en lugar de abrir una nueva cada vez
    pool:              true,
    maxConnections:    3,
    maxMessages:       100,
    connectionTimeout: 5000,
    greetingTimeout:   5000,
    socketTimeout:     8000,
    tls: { rejectUnauthorized: false }
})
const FROM = `"Bienes Raices" <${process.env.EMAIL_USER}>`


const _t0Verify = Date.now()
transport.verify((err) => {
    const ms = Date.now() - _t0Verify
    if (err) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error(`[Email] ✗ ERROR SMTP (${ms}ms): ${err.message}`)
        console.error(`[Email]   HOST: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`)
        console.error(`[Email]   USER: ${process.env.EMAIL_USER}`)
        console.error('[Email] → TODOS los correos iran a la cola. Revisa tus credenciales .env')
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } else {
        console.log(`[Email] ✓ SMTP conectado en ${ms}ms → ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`)
    }
})

// ─────────────────────────────────────────────────────────────────
// Exportar el transporte para que el worker pueda usarlo
// ─────────────────────────────────────────────────────────────────
export function obtenerTransporte() {
    return transport
}

// ─────────────────────────────────────────────────────────────────
// Cargar template HTML
// ─────────────────────────────────────────────────────────────────
const cargarTemplate = (archivo, variables) => {
    const ruta = join(__dirname, 'emails', archivo)
    let html = readFileSync(ruta, 'utf-8')
    Object.entries(variables).forEach(([clave, valor]) => {
        html = html.replaceAll(`{{${clave}}}`, valor)
    })
    return html
}

// ─────────────────────────────────────────────────────────────────
// Guardar en cola si falla el envío
// ─────────────────────────────────────────────────────────────────
async function guardarEnCola(tipo, opciones) {
    try {
        await EmailQueue.create({
            tipo,
            to:      opciones.to,
            subject: opciones.subject,
            html:    opciones.html,
            estado:  'pendiente'
        })
        console.log(`[EmailQueue] Guardado en cola -> ${opciones.to} (tipo: ${tipo})`)
    } catch (dbErr) {
        console.error(`[EmailQueue] No se pudo guardar en cola -> ${opciones.to}:`, dbErr.message)
    }
}

// ─────────────────────────────────────────────────────────────────
// Enviar con fallback a cola
// Intenta enviar directo; si falla, guarda en tb_email_queue
// ─────────────────────────────────────────────────────────────────
async function enviarConCola(tipo, opciones, etiqueta) {
    const t0 = Date.now()
    console.log(`[Email →] Iniciando envio: ${etiqueta}`)
    try {
        const info = await transport.sendMail(opciones)
        console.log(`[Email ✓] Enviado en ${Date.now() - t0}ms → ${etiqueta} | id: ${info.messageId}`)
    } catch (err) {
        console.error(`[Email ✗] Fallo en ${Date.now() - t0}ms → ${etiqueta}`)
        console.error(`[Email ✗] Error: ${err.message}`)
        console.warn('[Email →] Guardando en cola de reintentos...')
        await guardarEnCola(tipo, opciones)
    }
}

// ─────────────────────────────────────────────────────────────────
// EMAILS
// ─────────────────────────────────────────────────────────────────

const emailRegistro = ({ email, nombre, token }) => {
    const html = cargarTemplate('registro.html', {
        nombre,
        email,
        urlConfirmar: `${process.env.BACKEND_URL}/auth/confirmar/${token}`,
        year: new Date().getFullYear()
    })

    const opciones = {
        from:    FROM,
        to:      email,
        subject: 'Bienvenid@ a la plataforma de Bienes Raices - Confirma tu cuenta',
        html
    }

    // Fire-and-forget con cola automática si falla
    enviarConCola('registro', opciones, `Registro -> ${email}`)
        .catch(err => console.error('[emailRegistro] Error inesperado:', err.message))
}

// ─── FIX: se agrega "return" para que el controlador pueda encadenar .catch()
//          o usar await sin recibir undefined
const emailResetearPassword = ({ email, nombre, token }) => {
    const html = cargarTemplate('resetPassword.html', {
        nombre,
        email,
        urlRestablecer: `${process.env.BACKEND_URL}/auth/actualizarPassword/${token}`,
        year: new Date().getFullYear()
    })

    const opciones = {
        from:    FROM,
        to:      email,
        subject: 'Restablecer contrasena - BienesRaices',
        html
    }

    return enviarConCola('resetPassword', opciones, `ResetPassword → ${email}`)
        .catch(err => console.error('[emailResetearPassword] Error inesperado:', err.message))
}

const emailLoginSocial = ({ email, nombre, proveedor, token }) => {
    const proveedorFormateado = proveedor.charAt(0).toUpperCase() + proveedor.slice(1)

    const fechaHora = new Date().toLocaleString('es-MX', {
        timeZone:  'America/Mexico_City',
        dateStyle: 'full',
        timeStyle: 'short'
    })

    const html = cargarTemplate('socialLogin.html', {
        nombre,
        email,
        proveedor:  proveedorFormateado,
        fechaHora,
        urlFuiYo:   `${process.env.BACKEND_URL}/auth/loginSocial/confirmado`,
        urlRevocar: `${process.env.BACKEND_URL}/auth/loginSocial/revocar/${token}`,
        year:       new Date().getFullYear()
    })

    const opciones = {
        from:    FROM,
        to:      email,
        subject: `Nuevo acceso con ${proveedorFormateado} detectado - BienesRaices`,
        html
    }

    enviarConCola('loginSocial', opciones, `LoginSocial -> ${email}`)
        .catch(err => console.error('[emailLoginSocial] Error inesperado:', err.message))
}

const emailBloqueo = ({ email, nombre, minutosBloqueo, tokenDesbloqueo }) => {
    const fechaDesbloqueo = new Date(Date.now() + minutosBloqueo * 60 * 1000)
        .toLocaleString('es-MX', {
            timeZone:  'America/Mexico_City',
            dateStyle: 'full',
            timeStyle: 'short'
        })

    const html = cargarTemplate('bloqueo.html', {
        nombre,
        email,
        minutosBloqueo,
        fechaDesbloqueo,
        urlDesbloqueo: `${process.env.BACKEND_URL}/auth/desbloquear/${tokenDesbloqueo}`,
        year: new Date().getFullYear()
    })

    const opciones = {
        from:    FROM,
        to:      email,
        subject: 'Cuenta bloqueada por intentos fallidos - BienesRaices',
        html
    }

    enviarConCola('bloqueo', opciones, `Bloqueo -> ${email}`)
        .catch(err => console.error('[emailBloqueo] Error inesperado:', err.message))
}


const emailContacto = ({ emailVendedor, vendedor, nombreContacto, emailContacto, telefonoContacto, mensaje, tituloPropiedad, ciudadPropiedad, precioPropiedad }) => {
    const html = cargarTemplate('contacto.html', {
        vendedor,
        nombreContacto,
        emailContacto,
        telefonoContacto: telefonoContacto || 'No proporcionado',
        mensaje,
        tituloPropiedad,
        ciudadPropiedad,
        precioPropiedad:  Number(precioPropiedad).toLocaleString('es-MX'),
        year:             new Date().getFullYear()
    })

    const opciones = {
        from:     FROM,
        to:       emailVendedor,
        replyTo:  emailContacto,
        subject:  `Nuevo contacto sobre: ${tituloPropiedad} - BienesRaices`,
        html
    }

    return enviarConCola('contacto', opciones, `Contacto -> ${emailVendedor}`)
        .catch(err => console.error('[emailContacto] Error inesperado:', err.message))
}

export { emailRegistro, emailResetearPassword, emailLoginSocial, emailBloqueo, emailContacto }