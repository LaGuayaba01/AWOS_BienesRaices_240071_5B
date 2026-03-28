import Usuario from "../models/Usuario.js";
import {
    check,
    validationResult
} from "express-validator";
import {
    generarToken
} from "../lib/tokens.js";
import {
    establecerCookieJWT,
    limpiarCookieJWT
} from "../lib/jwtMiddleware.js";
import {
    emailRegistro,
    emailResetearPassword,
    emailLoginSocial,
    emailBloqueo
} from "../lib/emails.js";

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const validarRegistro = [
    check('nombreUsuario')
    .notEmpty().withMessage("El nombre no puede estar vacio")
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/).withMessage("El nombre solo puede contener letras y espacios"),
    check('emailUsuario')
    .notEmpty().withMessage("El correo no puede estar vacio")
    .isEmail().withMessage("El correo no tiene un formato valido"),
    check('passwordUsuario')
    .notEmpty().withMessage("La contrasena no puede estar vacia")
    .isLength({
        min: 8,
        max: 30
    }).withMessage("La contrasena debe tener entre 8 y 30 caracteres"),
    check('confirmacionUsuario')
    .custom((value, {
        req
    }) => {
        if (value !== req.body.passwordUsuario) throw new Error("Ambas contrasenas deben coincidir");
        return true;
    })
];

const validarEmail = [
    check('emailUsuario')
    .notEmpty().withMessage("El correo es obligatorio")
    .isEmail().withMessage("El correo no es valido")
];

const runValidators = (validators, req) =>
    Promise.all(validators.map(v => v.run(req)));

// ─────────────────────────────────────────────────────────────────
// FORMULARIOS
// ─────────────────────────────────────────────────────────────────

const formularioLogin = (req, res) => {
    res.render("auth/login", {
        pagina: "Inicia Sesion",
        mensaje: req.query.actualizado ? "Contrasena actualizada correctamente." : null,
        expirado: req.query.expirado === '1' ? 'Tu sesion ha expirado. Inicia sesion nuevamente.' : null,
        query: req.query
    });
};

const formularioRegistro = (req, res) => {
    res.render("auth/registro", {
        pagina: "Registrate con nosotros",
        query: req.query
    });
};

const formularioActualizacionPassword = (req, res) => {
    const {
        token
    } = req.params;
    res.render("auth/resetearPassword", {
        pagina: "Ingresa tu nueva contrasena",
        token
    });
};

const formularioRecuperacion = (req, res) => {
    res.render("auth/recuperarPassword", {
        pagina: "Te ayudamos a restaurar tu contrasena"
    });
};

// ─────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────

const autenticarUsuario = asyncHandler(async (req, res) => {
    const {
        emailUsuario,
        passwordUsuario
    } = req.body;

    if (!emailUsuario || !passwordUsuario) {
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: "Todos los campos son obligatorios"
            }]
        });
    }

    const usuario = await Usuario.findOne({
        where: {
            email: emailUsuario
        },
        attributes: ['id', 'name', 'email', 'password', 'confirmed', 'regStatus', 'loginAttempts', 'lockedUntil']
    });

    if (!usuario) {
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: "El correo o la contrasena son incorrectos"
            }]
        });
    }

    if (usuario.estaBloqueado()) {
        const minutos = Math.ceil((usuario.lockedUntil - new Date()) / 60000);
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: `Tu cuenta esta bloqueada. Intenta de nuevo en ${minutos} minuto(s).`
            }]
        });
    }

    if (!usuario.confirmed) {
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: "Tu cuenta aun no ha sido confirmada. Revisa tu correo."
            }]
        });
    }

    // ── Cuenta desactivada por el administrador ────────────────────────────────
    if (!usuario.regStatus) {
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: "Tu cuenta ha sido desactivada. Contacta al administrador para mas informacion."
            }]
        });
    }

    const passwordValida = await usuario.validarPassword(passwordUsuario);

    if (!passwordValida) {
        const intentos = await usuario.registrarIntentoFallido();

        if (intentos >= 5) {
            const tokenDesbloqueo = generarToken();
            await Usuario.update({
                token: tokenDesbloqueo
            }, {
                where: {
                    id: usuario.id
                }
            });
            emailBloqueo({
                nombre: usuario.name,
                email: usuario.email,
                minutosBloqueo: 30,
                tokenDesbloqueo
            });
            return res.render("auth/login", {
                pagina: "Inicia Sesion",
                errores: [{
                    msg: "Tu cuenta ha sido bloqueada por 30 minutos. Se te ha enviado un correo de desbloqueo."
                }]
            });
        }

        const restantes = 5 - intentos;
        return res.render("auth/login", {
            pagina: "Inicia Sesion",
            errores: [{
                msg: `Contrasena incorrecta. Te quedan ${restantes} intento(s) antes de que tu cuenta sea bloqueada.`
            }]
        });
    }

    await usuario.limpiarIntentos();
    usuario.lastLogin = new Date();
    await usuario.save();

    // Regenerar sesión antes de guardar datos del usuario
    // Esto genera un nuevo ID de sesión y un nuevo secreto CSRF
    // previniendo conflictos al cambiar de usuario sin cerrar sesión
    await new Promise((resolve, reject) => {
        req.session.regenerate(err => err ? reject(err) : resolve());
    });

    req.session.usuario = {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email
    };

    // Emitir JWT como cookie HttpOnly
    establecerCookieJWT(res, {
        id: usuario.id,
        name: usuario.name,
        email: usuario.email
    });

    // Solo en desarrollo — mostrar JWT en consola para pruebas en jwt.io
    if (process.env.NODE_ENV !== 'production') {
        const {
            generarJWT
        } = await import('../lib/jwtMiddleware.js');
        const tokenVisible = generarJWT({
            id: usuario.id,
            name: usuario.name,
            email: usuario.email
        });
        console.log(`\n[JWT] Token activo para ${usuario.email}:\n${tokenVisible}\n`);
    }

    const esAdmin = usuario.email === (process.env.ADMIN_EMAIL || '');
    return res.redirect(esAdmin ? '/admin' : '/propiedades');

});

// ─────────────────────────────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────────────────────────────

const registrarUsuario = asyncHandler(async (req, res) => {
    const {
        nombreUsuario,
        emailUsuario,
        passwordUsuario
    } = req.body;

    await runValidators(validarRegistro, req);
    const resultadoValidacion = validationResult(req);

    if (!resultadoValidacion.isEmpty()) {
        return res.render("auth/registro", {
            pagina: "Error al intentar crear la cuenta",
            errores: resultadoValidacion.array(),
            Usuario: {
                nombreUsuario,
                emailUsuario
            }
        });
    }

    const existeUsuario = await Usuario.findOne({
        where: {
            email: emailUsuario
        },
        attributes: ['id']
    });

    if (existeUsuario) {
        return res.render("auth/registro", {
            pagina: "Registrate con nosotros",
            errores: [{
                msg: `Ya existe un usuario con el correo ${emailUsuario}`
            }],
            Usuario: {
                nombreUsuario,
                emailUsuario
            }
        });
    }

    const usuario = await Usuario.create({
        name: nombreUsuario,
        email: emailUsuario,
        password: passwordUsuario,
        token: generarToken()
    });

    emailRegistro({
        email: usuario.email,
        nombre: usuario.name,
        token: usuario.token
    });

    return res.render("templates/mensaje", {
        title: "Bienvenid@ a BienesRaices",
        msg: `La cuenta asociada al correo ${emailUsuario} fue creada exitosamente. Revisa tu correo para confirmar tu cuenta.`,
        buttonURL: "/auth/login",
        buttonText: "Ir a Iniciar Sesion"
    });
});

// ─────────────────────────────────────────────────────────────────
// CONFIRMACION
// ─────────────────────────────────────────────────────────────────

const paginaConfirmacion = asyncHandler(async (req, res) => {
    const {
        token: tokenCuenta
    } = req.params;
    const usuarioToken = await Usuario.findOne({
        where: {
            token: tokenCuenta
        },
        attributes: ['id', 'token', 'confirmed']
    });

    if (!usuarioToken) {
        return res.render("templates/mensaje", {
            title: "Error al confirmar la cuenta",
            msg: "El token de verificacion no es valido, por favor intentalo de nuevo",
            buttonURL: "/auth/login",
            buttonText: "Ir a Iniciar Sesion"
        });
    }

    usuarioToken.token = null;
    usuarioToken.confirmed = true;
    await usuarioToken.save();

    return res.render("templates/mensaje", {
        title: "Cuenta confirmada",
        msg: "Tu cuenta ha sido confirmada exitosamente, ya puedes iniciar sesion",
        buttonURL: "/auth/login",
        buttonText: "Ir a Iniciar Sesion"
    });
});

// ─────────────────────────────────────────────────────────────────
// RECUPERAR CONTRASENA
// ─────────────────────────────────────────────────────────────────

const ultimoEnvio = new Map();
const THROTTLE_MS = 2 * 60 * 1000;

const resetearPassword = asyncHandler(async (req, res) => {
    await runValidators(validarEmail, req);
    const resultado = validationResult(req);

    if (!resultado.isEmpty()) {
        return res.render("auth/recuperarPassword", {
            pagina: "Quieres restaurar tu contraseña?",
            errores: resultado.array()
        });
    }

    const {
        emailUsuario: usuarioSolicitante
    } = req.body;
    const ahora = Date.now();
    const ultimaVez = ultimoEnvio.get(usuarioSolicitante) ?? 0;
    const segundosRestantes = Math.ceil((THROTTLE_MS - (ahora - ultimaVez)) / 1000);

    if (ahora - ultimaVez < THROTTLE_MS) {
        return res.render("templates/mensaje", {
            title: "Solicitud demasiado reciente",
            msg: `Ya se envio un correo a esta direccion. Por favor espera ${segundosRestantes} segundos antes de intentarlo de nuevo.`,
            buttonText: "Regresar",
            buttonURL: "/auth/recuperarPassword"
        });
    }

    const usuario = await Usuario.findOne({
        where: {
            email: usuarioSolicitante
        },
        attributes: ['id', 'name', 'email', 'confirmed', 'token']
    });

    if (!usuario) {
        return res.render("templates/mensaje", {
            title: "Error buscando la cuenta",
            msg: `No se ha encontrado ninguna cuenta asociada al correo: ${usuarioSolicitante}`,
            buttonText: "Intentalo de nuevo",
            buttonURL: "/auth/recuperarPassword"
        });
    }

    if (!usuario.confirmed) {
        return res.render("templates/mensaje", {
            title: "Cuenta no confirmada",
            msg: `La cuenta asociada al correo: ${usuarioSolicitante}, no ha sido validada.`,
            buttonText: "Intentalo de nuevo",
            buttonURL: "/auth/recuperarPassword"
        });
    }

    const token = usuario.generarTokenRecuperacion();
    await usuario.save();
    ultimoEnvio.set(usuarioSolicitante, Date.now());

    try {
        await emailResetearPassword({
            nombre: usuario.name,
            email: usuario.email,
            token
        });
    } catch (err) {
        console.error('[Email ERROR] resetearPassword:', err.message);
    }

    res.render("templates/mensaje", {
        title: "Correo enviado",
        msg: "Te hemos enviado un correo electronico con la liga segura para restaurar tu contrasena.",
        buttonText: "Regresar al inicio",
        buttonURL: "/auth/login"
    });
});

// ─────────────────────────────────────────────────────────────────
// ACTUALIZAR CONTRASENA
// ─────────────────────────────────────────────────────────────────

const actualizarPassword = asyncHandler(async (req, res) => {
    const {
        token
    } = req.params;
    const {
        passwordUsuario,
        confirmacionUsuario
    } = req.body;

    if (!passwordUsuario || passwordUsuario.length < 8) {
        return res.render("auth/resetearPassword", {
            pagina: "Ingresa tu nueva contrasena",
            token,
            errores: [{
                msg: "La contrasena debe tener al menos 8 caracteres"
            }]
        });
    }
    if (passwordUsuario !== confirmacionUsuario) {
        return res.render("auth/resetearPassword", {
            pagina: "Ingresa tu nueva contrasena",
            token,
            errores: [{
                msg: "Las contrasenas no coinciden"
            }]
        });
    }

    const usuario = await Usuario.findByTokenRecuperacion(token);

    if (!usuario) {
        return res.render("auth/resetearPassword", {
            pagina: "Ingresa tu nueva contrasena",
            token,
            errores: [{
                msg: "Token invalido o expirado"
            }]
        });
    }

    usuario.limpiarTokenRecuperacion();
    usuario.password = passwordUsuario;
    await usuario.save();

    res.redirect("/auth/login?actualizado=1");
});

// ─────────────────────────────────────────────────────────────────
// OAUTH
// ─────────────────────────────────────────────────────────────────

const socialAuthSuccess = asyncHandler(async (req, res) => {
    const usuario = req.user;

    if (usuario?.estaBloqueado()) {
        req.logout((err) => {
            if (err) console.error(err);
        });
        return res.redirect("/auth/login?bloqueado=1");
    }

    if (usuario?.email && usuario?._loginProvider) {
        const tokenRevocacion = generarToken();
        await Usuario.update({
                token: tokenRevocacion
            }, {
                where: {
                    id: usuario.id
                }
            })
            .catch(err => console.error("[LoginSocial] Error guardando token:", err.message));
        emailLoginSocial({
            nombre: usuario.name,
            email: usuario.email,
            proveedor: usuario._loginProvider,
            token: tokenRevocacion
        });
    }

    // Emitir JWT para sesión social
    if (usuario) {
        establecerCookieJWT(res, {
            id: usuario.id,
            name: usuario.name,
            email: usuario.email
        });
    }

    // Admin va al dashboard, usuarios normales a propiedades
    const destino = usuario?.email === (process.env.ADMIN_EMAIL || '') ? '/admin' : '/propiedades';
    res.redirect(destino);
});

const socialAuthFailure = (req, res) => {
    res.render("templates/mensaje", {
        title: "Error al iniciar sesion",
        msg: "No fue posible autenticarte con la red social seleccionada.",
        buttonURL: "/auth/login",
        buttonText: "Ir a Iniciar Sesion"
    });
};

// ─────────────────────────────────────────────────────────────────
// LOGIN SOCIAL — CONFIRMAR / REVOCAR
// ─────────────────────────────────────────────────────────────────

const loginSocialConfirmado = asyncHandler(async (req, res) => {
    if (req.user?.id) {
        await Usuario.update({
                token: null
            }, {
                where: {
                    id: req.user.id
                }
            })
            .catch(err => console.error("[LoginSocial] Error limpiando token:", err.message));
    }
    res.render("templates/mensaje", {
        title: "Acceso confirmado",
        msg: "Gracias por confirmar. Su cuenta esta segura.",
        buttonText: "Ir al inicio",
        buttonURL: "/"
    });
});

const loginSocialRevocar = asyncHandler(async (req, res) => {
    const {
        token
    } = req.params;
    const usuario = await Usuario.findOne({
        where: {
            token
        },
        attributes: ['id', 'token']
    });

    if (!usuario) {
        return res.render("templates/mensaje", {
            title: "Enlace invalido o expirado",
            msg: "Este enlace ya no es valido.",
            buttonText: "Ir al inicio",
            buttonURL: "/"
        });
    }
    res.render("auth/confirmarRevocar", {
        pagina: "Eliminar cuenta",
        token
    });
});

const loginSocialRevocarConfirmado = asyncHandler(async (req, res) => {
    const {
        token
    } = req.params;
    const usuario = await Usuario.findOne({
        where: {
            token
        },
        attributes: ['id', 'token']
    });

    if (!usuario) {
        return res.render("templates/mensaje", {
            title: "Enlace invalido o expirado",
            msg: "Este enlace ya no es valido.",
            buttonText: "Ir al inicio",
            buttonURL: "/"
        });
    }
    await usuario.destroy();
    res.render("templates/mensaje", {
        title: "Cuenta eliminada",
        msg: "Su cuenta ha sido eliminada correctamente.",
        buttonText: "Crear nueva cuenta",
        buttonURL: "/auth/registro"
    });
});

// ─────────────────────────────────────────────────────────────────
// DESBLOQUEO
// ─────────────────────────────────────────────────────────────────

const formularioDesbloqueo = asyncHandler(async (req, res) => {
    const {
        token
    } = req.params;
    const usuario = await Usuario.findOne({
        where: {
            token
        },
        attributes: ['id', 'token', 'lockedUntil', 'name']
    });

    if (!usuario) {
        return res.render("templates/mensaje", {
            title: "Enlace invalido o expirado",
            msg: "Este enlace de desbloqueo no es valido o ya fue utilizado.",
            buttonText: "Ir al login",
            buttonURL: "/auth/login"
        });
    }
    if (!usuario.estaBloqueado()) {
        return res.render("templates/mensaje", {
            title: "Cuenta ya disponible",
            msg: "Tu cuenta ya esta desbloqueada.",
            buttonText: "Ir al login",
            buttonURL: "/auth/login"
        });
    }
    res.render("auth/desbloquear", {
        pagina: "Desbloquear cuenta",
        token,
        nombre: usuario.name
    });
});

const desbloquearCuenta = asyncHandler(async (req, res) => {
    const {
        token
    } = req.params;
    const usuario = await Usuario.findOne({
        where: {
            token
        },
        attributes: ['id', 'token', 'lockedUntil', 'loginAttempts']
    });

    if (!usuario) {
        return res.render("templates/mensaje", {
            title: "Enlace invalido o expirado",
            msg: "Este enlace de desbloqueo no es valido o ya fue utilizado.",
            buttonText: "Ir al login",
            buttonURL: "/auth/login"
        });
    }

    usuario.token = null;
    await usuario.limpiarIntentos();

    return res.render("templates/mensaje", {
        title: "Cuenta desbloqueada",
        msg: "Tu cuenta ha sido desbloqueada correctamente. Ya puedes iniciar sesion.",
        buttonText: "Ir al login",
        buttonURL: "/auth/login"
    });
});

// ─────────────────────────────────────────────────────────────────
// API — registro offline
// ─────────────────────────────────────────────────────────────────

const registrarUsuarioAPI = asyncHandler(async (req, res) => {
    const {
        nombreUsuario,
        emailUsuario,
        passwordUsuario
    } = req.body;

    await runValidators(validarRegistro, req);
    const resultadoValidacion = validationResult(req);

    if (!resultadoValidacion.isEmpty()) {
        return res.status(422).json({
            ok: false,
            errores: resultadoValidacion.array().map(e => e.msg)
        });
    }

    const existeUsuario = await Usuario.findOne({
        where: {
            email: emailUsuario
        },
        attributes: ['id']
    });

    if (existeUsuario) {
        return res.status(409).json({
            ok: false,
            errores: [`Ya existe un usuario con el correo ${emailUsuario}`]
        });
    }

    const usuario = await Usuario.create({
        name: nombreUsuario,
        email: emailUsuario,
        password: passwordUsuario,
        token: generarToken()
    });
    emailRegistro({
        email: usuario.email,
        nombre: usuario.name,
        token: usuario.token
    });

    return res.status(201).json({
        ok: true,
        mensaje: `Cuenta creada para ${emailUsuario}. Revisa tu correo para confirmar.`
    });
});

// ─────────────────────────────────────────────────────────────────
// PING — verifica si la sesión sigue activa (usado por session-check.js)
// ─────────────────────────────────────────────────────────────────

const ping = (req, res) => {
    const sesionActiva = req.session?.usuario || req.user;
    if (!sesionActiva) return res.status(401).json({
        ok: false,
        msg: 'Sesion expirada'
    });
    return res.status(200).json({
        ok: true
    });
};

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export {
    formularioLogin,
    autenticarUsuario,
    formularioRegistro,
    registrarUsuario,
    registrarUsuarioAPI,
    formularioRecuperacion,
    paginaConfirmacion,
    resetearPassword,
    formularioActualizacionPassword,
    actualizarPassword,
    socialAuthSuccess,
    socialAuthFailure,
    loginSocialConfirmado,
    loginSocialRevocar,
    loginSocialRevocarConfirmado,
    formularioDesbloqueo,
    desbloquearCuenta,
    ping
};