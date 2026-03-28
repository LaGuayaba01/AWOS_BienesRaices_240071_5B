/**
 * jwtMiddleware.js
 * ─────────────────────────────────────────────────────────────────
 * Capa adicional de JWT sobre express-session.
 *
 * Estrategia:
 *  - Al hacer login exitoso se genera un JWT y se guarda en una
 *    cookie HttpOnly (br-token)
 *  - En cada request el middleware verifica AMBOS: sesión + JWT
 *  - Si alguno falla → redirige al login (rutas web) o 401 (rutas API)
 *  - Al hacer logout se destruye la sesión Y se limpia la cookie JWT
 * ─────────────────────────────────────────────────────────────────
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET   = process.env.JWT_SECRET || 'PC-BienesRaices_JWT_secret_240709';
const JWT_EXPIRES  = process.env.JWT_EXPIRES || '24h';
const COOKIE_NAME  = 'br-token';
const IS_PROD      = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────────
// Generar token JWT
// ─────────────────────────────────────────────────────────────────
export function generarJWT(usuario) {
    return jwt.sign(
        {
            id:    usuario.id,
            name:  usuario.name,
            email: usuario.email
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
    );
}

// ─────────────────────────────────────────────────────────────────
// Establecer cookie JWT en la respuesta
// ─────────────────────────────────────────────────────────────────
export function establecerCookieJWT(res, usuario) {
    const token = generarJWT(usuario);

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure:   IS_PROD,
        maxAge:   24 * 60 * 60 * 1000  // 24 horas
    });

    return token;
}

// ─────────────────────────────────────────────────────────────────
// Limpiar cookie JWT
// ─────────────────────────────────────────────────────────────────
export function limpiarCookieJWT(res) {
    res.clearCookie(COOKIE_NAME);
}

// ─────────────────────────────────────────────────────────────────
// Verificar JWT — middleware para rutas web
// Requiere sesión activa Y JWT válido
// ─────────────────────────────────────────────────────────────────
export function verificarJWT(req, res, next) {
    const sesionActiva = req.session?.usuario || req.user;

    if (!sesionActiva) {
        return res.redirect('/auth/login');
    }

    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
        console.warn(`[JWT] Cookie ausente — usuario id=${sesionActiva.id}`);
        return res.redirect('/auth/login?jwt=expirado');
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        // Verificar que el JWT pertenece al mismo usuario de la sesión
        if (payload.id !== sesionActiva.id) {
            console.warn(`[JWT] Mismatch sesion/token — sesion=${sesionActiva.id} jwt=${payload.id}`);
            limpiarCookieJWT(res);
            return res.redirect('/auth/login?jwt=invalido');
        }

        // Adjuntar payload al request para uso en controladores
        req.jwtPayload = payload;
        next();

    } catch (err) {
        console.warn(`[JWT] Token invalido: ${err.message}`);
        limpiarCookieJWT(res);
        return res.redirect('/auth/login?jwt=expirado');
    }
}

// ─────────────────────────────────────────────────────────────────
// Verificar JWT — middleware para rutas API (responde JSON)
// ─────────────────────────────────────────────────────────────────
export function verificarJWTApi(req, res, next) {
    // Buscar token en cookie o en header Authorization: Bearer <token>
    const token =
        req.cookies?.[COOKIE_NAME] ||
        req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ ok: false, msg: 'Token requerido' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.jwtPayload = payload;
        next();
    } catch (err) {
        return res.status(401).json({ ok: false, msg: 'Token invalido o expirado' });
    }
}
