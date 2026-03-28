

import nodemailer from 'nodemailer'
import { Op } from 'sequelize'
import EmailQueue from '../models/EmailQueue.js'
import { obtenerTransporte } from './emails.js'

// Intervalo configurable entre ejecuciones del worker
const INTERVALO_MS = parseInt(process.env.EMAIL_WORKER_INTERVAL_MS) || 60 * 1000 // 1 minuto por defecto

// Backoff exponencial: intento 1 → 2min, 2 → 4min, 3 → 8min, 4 → 16min
function calcularProximoIntento(intentos) {
    const minutosEspera = Math.pow(2, intentos)
    return new Date(Date.now() + minutosEspera * 60 * 1000)
}

/**
 * Clasifica si un error de nodemailer es de red/conexión (reintentable)
 * o lógico/permanente (debe marcarse como fallido).
 */
function esErrorDeRed(err) {
    const msg = (err.message || '').toLowerCase()
    const code = err.code || ''

    // Errores de conexión → reintentable
    const reintentables = [
        'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH',
        'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ESOCKET'
    ]
    if (reintentables.includes(code)) return true

    // Errores SMTP temporales 4xx → reintentable
    if (err.responseCode && err.responseCode >= 400 && err.responseCode < 500) return true

    // Mensajes que sugieren problema de red
    if (msg.includes('timeout') || msg.includes('connection') || msg.includes('network')) return true

    return false
}

async function procesarCola() {
    let pendientes

    try {
        pendientes = await EmailQueue.findAll({
            where: {
                estado: 'pendiente',
                intentos: { [Op.lt]: 5 },
                [Op.or]: [
                    { proximoIntento: null },
                    { proximoIntento: { [Op.lte]: new Date() } }
                ]
            },
            order: [['created_at', 'ASC']],
            limit: 10,
            logging: false   // suprimir log cuando la cola está vacía
        })
    } catch (err) {
        return
    }

    if (!pendientes.length) return

    console.log(`[EmailQueue] Procesando ${pendientes.length} email(s) pendiente(s)...`)

    const transport = obtenerTransporte()

    for (const item of pendientes) {
        try {
            const info = await transport.sendMail({
                // ✅ FIX CRÍTICO: usar EMAIL_USER como remitente, NO item.to
                from:    `"Bienes Raices" <${process.env.EMAIL_USER}>`,
                to:      item.to,
                subject: item.subject,
                html:    item.html
            })

            item.estado      = 'enviado'
            item.intentos    = item.intentos + 1
            item.ultimoError = null
            await item.save()

            const url = nodemailer.getTestMessageUrl(info)
            console.log(`[EmailQueue] ✓ Enviado -> ${item.to} (tipo: ${item.tipo})`)
            if (url) console.log(`[EmailQueue]   👁  Ver correo: ${url}`)

        } catch (err) {
            const nuevosIntentos = item.intentos + 1
            const esRed          = esErrorDeRed(err)

            if (!esRed || nuevosIntentos >= item.maxIntentos) {
                // Error lógico (formato inválido, dirección inexistente) → fallido permanente
                // O agotó todos los intentos → fallido
                item.estado      = 'fallido'
                item.intentos    = nuevosIntentos
                item.ultimoError = `[${esRed ? 'RED' : 'LOGICO'}] ${err.message}`
                await item.save()
                console.error(`[EmailQueue] ✗ Fallido ${esRed ? '(reintentos agotados)' : '(error lógico)'} -> ${item.to}: ${err.message}`)
            } else {
                // Error de red → programar próximo intento con backoff
                item.intentos       = nuevosIntentos
                item.ultimoError    = `[RED] ${err.message}`
                item.proximoIntento = calcularProximoIntento(nuevosIntentos)
                await item.save()
                console.warn(`[EmailQueue] ↻ Reintento ${nuevosIntentos}/${item.maxIntentos} (error de red) programado para ${item.proximoIntento.toLocaleTimeString('es-MX')} -> ${item.to}`)
            }
        }
    }
}

export function iniciarWorkerEmail() {
    const intervaloSegundos = Math.round(INTERVALO_MS / 1000)
    console.log(`[EmailQueue] Worker iniciado. Revisando cada ${intervaloSegundos} segundo(s).`)

    // Ejecutar inmediatamente al iniciar
    procesarCola()

    const timer = setInterval(procesarCola, INTERVALO_MS)
    timer.unref()
}