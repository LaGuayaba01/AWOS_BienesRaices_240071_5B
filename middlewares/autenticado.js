import { limpiarCookieJWT } from '../lib/jwtMiddleware.js';
import { establecerCookieJWT } from '../lib/jwtMiddleware.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET  = process.env.JWT_SECRET || 'PC-BienesRaices_JWT_secret_240709';
const COOKIE_NAME = 'br-token';

const autenticado = (req, res, next) => {
    // Evitar que el navegador cachee páginas autenticadas
    // Así al presionar "atrás" tras logout no muestra la página anterior
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // 1. Verificar sesión (express-session o Passport OAuth)
    const sesionActiva = req.session?.usuario || req.user;

    if (!sesionActiva) {
        limpiarCookieJWT(res);
        return res.redirect('/auth/login');
    }

    // 2. Verificar JWT
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
        // No hay JWT — puede ser la primera carga después del login
        // Regenerar el JWT automáticamente si hay sesión válida
        console.log(`[JWT] Cookie ausente — regenerando para usuario id=${sesionActiva.id}`);
        establecerCookieJWT(res, {
            id:    sesionActiva.id,
            name:  sesionActiva.name,
            email: sesionActiva.email
        });

        req.usuarioActual = {
            id:        sesionActiva.id,
            name:      sesionActiva.name  || '',
            email:     sesionActiva.email || '',
            avatarUrl: req.user?.socialAccounts?.[0]?.avatarUrl || null
        };

        return next();
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        // Verificar que el JWT corresponde al usuario de la sesión
        if (payload.id !== sesionActiva.id) {
            console.warn(`[JWT] Mismatch — sesion=${sesionActiva.id} jwt=${payload.id}`);
            limpiarCookieJWT(res);
            return res.redirect('/auth/login');
        }

        req.usuarioActual = {
            id:        sesionActiva.id,
            name:      sesionActiva.name  || '',
            email:     sesionActiva.email || '',
            avatarUrl: req.user?.socialAccounts?.[0]?.avatarUrl || null
        };

        req.jwtPayload = payload;
        next();

    } catch (err) {
        console.warn(`[JWT] Token invalido: ${err.message} — regenerando`);

        // Token corrupto o firmado con secret distinto — regenerar
        establecerCookieJWT(res, {
            id:    sesionActiva.id,
            name:  sesionActiva.name,
            email: sesionActiva.email
        });

        req.usuarioActual = {
            id:        sesionActiva.id,
            name:      sesionActiva.name  || '',
            email:     sesionActiva.email || '',
            avatarUrl: req.user?.socialAccounts?.[0]?.avatarUrl || null
        };

        next();
    }
};

export default autenticado;