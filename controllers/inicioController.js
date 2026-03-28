import Propiedad from "../models/Propiedad.js";
import { Op } from "sequelize";
import Usuario from "../models/Usuario.js";
import { emailContacto } from "../lib/emails.js";
import { body, validationResult } from "express-validator";

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────
// GET / — Página pública de inicio
// ─────────────────────────────────────────────────────────────────

const inicio = asyncHandler(async (req, res) => {

    // ── Parámetros ───────────────────────────────────────────────
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite    = [6, 12, 24].includes(parseInt(req.query.limite)) ? parseInt(req.query.limite) : 6;
    const buscar    = (req.query.buscar    || '').trim();
    const categoria = (req.query.categoria || '').trim();
    const ciudad    = (req.query.ciudad    || '').trim();
    const offset    = (pagina - 1) * limite;

    // ── Where: solo propiedades activas (visibles al público) ────
    const where = { estatus: 'activa' };

    if (buscar)    where[Op.or] = [
        { titulo:   { [Op.like]: `%${buscar}%` } },
        { ciudad:   { [Op.like]: `%${buscar}%` } },
        { direccion: { [Op.like]: `%${buscar}%` } }
    ];
    if (categoria) where.categoria = categoria;
    if (ciudad)    where.ciudad    = { [Op.like]: `%${ciudad}%` };

    // ── Consulta principal ───────────────────────────────────────
    const { count, rows: propiedades } = await Propiedad.findAndCountAll({
        where,
        order:  [['created_at', 'DESC']],
        limit:  limite,
        offset
    });

    const totalPaginas = Math.ceil(count / limite);

    // ── Ciudades únicas para el filtro ───────────────────────────
    const ciudadesRaw = await Propiedad.findAll({
        where:      { estatus: 'activa' },
        attributes: ['ciudad'],
        group:      ['ciudad'],
        order:      [['ciudad', 'ASC']]
    });
    const ciudades = ciudadesRaw.map(p => p.ciudad);

    const success = req.query.bienvenido ? `¡Bienvenido de nuevo, ${req.session?.usuario?.name || req.user?.name || ''}!` : null;

    res.render('inicio/index.pug', {
        pagina:       'Inicio',
        success,
        propiedades,
        totalResultados:  count,
        paginaActual:     pagina,
        totalPaginas,
        limite,
        buscar,
        categoriaActiva:  categoria,
        ciudadActiva:     ciudad,
        ciudades
    });
});



// ─────────────────────────────────────────────────────────────────
// GET /propiedad/:id — Detalle público con formulario de contacto
// ─────────────────────────────────────────────────────────────────

const verPropiedadPublica = asyncHandler(async (req, res) => {
    const propiedad = await Propiedad.findOne({
        where: { id: req.params.id, estatus: 'activa' },
        include: [{ model: Usuario, as: 'vendedor', attributes: ['name', 'email'] }]
    });

    if (!propiedad) {
        return res.status(404).render('templates/404', { pagina: 'Propiedad no encontrada' });
    }

    res.render('inicio/detalle', {
        pagina:    propiedad.titulo,
        propiedad,
        mensajeEnviado: false,
        errorContacto:  null,
        formData:       null
    });
});

// ─────────────────────────────────────────────────────────────────
// POST /propiedad/:id/contacto — Procesar formulario de contacto
// ─────────────────────────────────────────────────────────────────

const validarContacto = [
    body('nombre').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('El email no es válido').normalizeEmail(),
    body('mensaje').trim().notEmpty().withMessage('El mensaje es obligatorio').isLength({ min: 10, max: 1000 })
];

const enviarContacto = [
    ...validarContacto,
    asyncHandler(async (req, res) => {
        const propiedad = await Propiedad.findOne({
            where: { id: req.params.id, estatus: 'activa' },
            include: [{ model: Usuario, as: 'vendedor', attributes: ['name', 'email'] }]
        });

        if (!propiedad) {
            return res.status(404).render('templates/404', { pagina: 'Propiedad no encontrada' });
        }

        const errores = validationResult(req);
        const formData = { nombre: req.body.nombre, email: req.body.email, telefono: req.body.telefono, mensaje: req.body.mensaje };

        if (!errores.isEmpty()) {
            return res.render('inicio/detalle', {
                pagina:         propiedad.titulo,
                propiedad,
                mensajeEnviado: false,
                errorContacto:  errores.array()[0].msg,
                formData
            });
        }

        // Enviar email al vendedor
        emailContacto({
            emailVendedor:    propiedad.vendedor.email,
            vendedor:         propiedad.vendedor.name,
            nombreContacto:   req.body.nombre,
            emailContacto:    req.body.email,
            telefonoContacto: req.body.telefono || '',
            mensaje:          req.body.mensaje,
            tituloPropiedad:  propiedad.titulo,
            ciudadPropiedad:  propiedad.ciudad,
            precioPropiedad:  propiedad.precio
        });

        res.render('inicio/detalle', {
            pagina:         propiedad.titulo,
            propiedad,
            mensajeEnviado: true,
            errorContacto:  null,
            formData:       null
        });
    })
];

export { inicio, verPropiedadPublica, enviarContacto };