import Propiedad from "../models/Propiedad.js";
import cloudinary from "../config/cloudinaryConfig.js";
import { check, validationResult } from "express-validator";
import { Op } from "sequelize";

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────
// VALIDACIONES
// ─────────────────────────────────────────────────────────────────

const validarPropiedad = [
    check('titulo')
        .notEmpty().withMessage("El titulo es obligatorio")
        .isLength({ min: 3, max: 150 }).withMessage("El titulo debe tener entre 3 y 150 caracteres"),
    check('descripcion')
        .notEmpty().withMessage("La descripcion es obligatoria"),
    check('precio')
        .notEmpty().withMessage("El precio es obligatorio")
        .isDecimal().withMessage("El precio debe ser un numero valido")
        .custom(v => parseFloat(v) >= 0).withMessage("El precio no puede ser negativo"),
    check('habitaciones')
        .notEmpty().withMessage("Las habitaciones son obligatorias")
        .isInt({ min: 1 }).withMessage("Debe tener al menos 1 habitacion"),
    check('banos')
        .notEmpty().withMessage("Los banos son obligatorios")
        .isInt({ min: 1 }).withMessage("Debe tener al menos 1 bano"),
    check('estacionamientos')
        .notEmpty().withMessage("Los estacionamientos son obligatorios")
        .isInt({ min: 0 }).withMessage("Los estacionamientos no pueden ser negativos"),
    check('direccion')
        .notEmpty().withMessage("La direccion es obligatoria"),
    check('ciudad')
        .notEmpty().withMessage("La ciudad es obligatoria"),
    check('categoria')
        .notEmpty().withMessage("La categoria es obligatoria")
        .isIn(['casa', 'departamento', 'terreno']).withMessage("Categoria invalida"),
    check('imagen')
        .optional({ checkFalsy: true })
        .isURL().withMessage("La imagen debe ser una URL valida"),
];

const runValidators = (validators, req) =>
    Promise.all(validators.map(v => v.run(req)));

// ─────────────────────────────────────────────────────────────────
// READ — Mis Propiedades
// ─────────────────────────────────────────────────────────────────

const misPropiedades = asyncHandler(async (req, res) => {
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    // ── Parámetros de paginación, filtros y búsqueda ─────────────
    const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite    = [6, 12, 24].includes(parseInt(req.query.limite)) ? parseInt(req.query.limite) : 6;
    const buscar    = (req.query.buscar    || '').trim();
    const categoria = (req.query.categoria || '').trim();
    const estatus   = (req.query.estatus   || '').trim();
    const offset    = (pagina - 1) * limite;

    // ── Construir where dinámico ─────────────────────────────────
    const where = { usuarioId };

    if (buscar)    where[Op.or] = [
        { titulo:   { [Op.like]: `%${buscar}%` } },
        { ciudad:   { [Op.like]: `%${buscar}%` } }
    ];
    if (categoria) where.categoria = categoria;
    if (estatus)   where.estatus   = estatus;

    // ── Consulta con total ───────────────────────────────────────
    const { count, rows: propiedades } = await Propiedad.findAndCountAll({
        where,
        order:  [['created_at', 'DESC']],
        limit:  limite,
        offset
    });

    const totalPaginas = Math.ceil(count / limite);

    const success = req.query.creada      ? 'Propiedad registrada correctamente.'
                  : req.query.actualizada ? 'Propiedad actualizada correctamente.'
                  : req.query.eliminada   ? 'Propiedad eliminada correctamente.'
                  : req.query.cambioEstatus ? 'Estatus de la propiedad actualizado.'
                  : null;

    res.render('propiedades/misPropiedades', {
        pagina:       'Mis Propiedades',
        propiedades,
        success,
        // paginación
        paginaActual: pagina,
        totalPaginas,
        totalResultados: count,
        limite,
        // filtros activos
        buscar,
        categoriaActiva: categoria,
        estatusActivo:   estatus
    });
});

// ─────────────────────────────────────────────────────────────────
// CREATE — Formulario nueva propiedad
// ─────────────────────────────────────────────────────────────────

const formularioNuevaPropiedad = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('propiedades/nueva', {
        pagina:    'Nueva Propiedad',
        propiedad: {}
    });
};

const crearPropiedad = asyncHandler(async (req, res) => {
    await runValidators(validarPropiedad, req);
    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        return res.render('propiedades/nueva', {
            pagina:    'Nueva Propiedad',
            errores:   errores.array(),
            propiedad: req.body
        });
    }

    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    // Si hubo error al subir imágenes, informar al usuario
    if (req.uploadError) {
        return res.render('propiedades/nueva', {
            pagina:    'Nueva Propiedad',
            errores:   [{ msg: `Error al subir imágenes: ${req.uploadError}` }],
            propiedad: req.body
        });
    }

    const { titulo, descripcion, precio, direccion, ciudad, categoria } = req.body;

    // Parsear valores numéricos para evitar "Out of range" en TINYINT
    const habitaciones    = parseInt(req.body.habitaciones,    10) || 1;
    const banos           = parseInt(req.body.banos,           10) || 1;
    const estacionamientos = parseInt(req.body.estacionamientos, 10) || 0;
    const precioNum       = parseFloat(precio) || 0;

    // Procesar imagenes subidas a Cloudinary
    const imagenes    = req.files ? req.files.map(f => f.path) : [];
    const imagenesIds = req.files ? req.files.map(f => f.filename) : [];

    await Propiedad.create({
        titulo,
        descripcion,
        precio: precioNum,
        habitaciones,
        banos,
        estacionamientos,
        direccion,
        ciudad,
        categoria,
        imagenes:    imagenes.length    ? imagenes    : null,
        imagenesIds: imagenesIds.length ? imagenesIds : null,
        usuarioId
    });

    return res.redirect('/propiedades?creada=1');
});

// ─────────────────────────────────────────────────────────────────
// UPDATE — Formulario editar propiedad
// ─────────────────────────────────────────────────────────────────

const formularioEditarPropiedad = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) {
        return res.render('templates/mensaje', {
            title:      'Propiedad no encontrada',
            msg:        'La propiedad que intentas editar no existe.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    // Verificar que el dueño sea el usuario actual
    if (propiedad.usuarioId !== usuarioId) {
        return res.render('templates/mensaje', {
            title:      'Accion no permitida',
            msg:        'No tienes permiso para editar esta propiedad.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('propiedades/editar', {
        pagina:    'Editar Propiedad',
        propiedad
    });
});

const editarPropiedad = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) {
        return res.render('templates/mensaje', {
            title:      'Propiedad no encontrada',
            msg:        'La propiedad que intentas editar no existe.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    if (propiedad.usuarioId !== usuarioId) {
        return res.render('templates/mensaje', {
            title:      'Accion no permitida',
            msg:        'No tienes permiso para editar esta propiedad.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    await runValidators(validarPropiedad, req);
    const errores = validationResult(req);

    if (!errores.isEmpty()) {
        return res.render('propiedades/editar', {
            pagina:    'Editar Propiedad',
            errores:   errores.array(),
            propiedad: { ...propiedad.toJSON(), ...req.body }
        });
    }

    const { titulo, descripcion, precio, direccion, ciudad, categoria, eliminarImagenes } = req.body;

    // Parsear valores numéricos para evitar "Out of range" en TINYINT
    const habitaciones     = parseInt(req.body.habitaciones,     10) || 1;
    const banos            = parseInt(req.body.banos,            10) || 1;
    const estacionamientos = parseInt(req.body.estacionamientos, 10) || 0;

    let imagenes    = propiedad.imagenes    || [];
    let imagenesIds = propiedad.imagenesIds || [];

    // Eliminar imagenes seleccionadas
    if (eliminarImagenes) {
        const aEliminar = Array.isArray(eliminarImagenes) ? eliminarImagenes : [eliminarImagenes];
        for (const publicId of aEliminar) {
            await cloudinary.uploader.destroy(publicId).catch(e => console.error('[Cloudinary] Error eliminando:', e.message));
        }
        const idx    = imagenesIds.filter(id => !aEliminar.includes(id));
        imagenes     = imagenes.filter((_, i) => !aEliminar.includes(imagenesIds[i]));
        imagenesIds  = idx;
    }

    // Agregar nuevas imagenes
    if (req.files && req.files.length > 0) {
        imagenes    = [...imagenes,    ...req.files.map(f => f.path)];
        imagenesIds = [...imagenesIds, ...req.files.map(f => f.filename)];
    }

    await propiedad.update({
        titulo,
        descripcion,
        precio: parseFloat(precio) || propiedad.precio,
        habitaciones,
        banos,
        estacionamientos,
        direccion,
        ciudad,
        categoria,
        imagenes:    imagenes.length    ? imagenes    : null,
        imagenesIds: imagenesIds.length ? imagenesIds : null
    });

    return res.redirect('/propiedades?actualizada=1');
});

// ─────────────────────────────────────────────────────────────────
// DELETE — Eliminar propiedad
// ─────────────────────────────────────────────────────────────────

const eliminarPropiedad = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) {
        return res.render('templates/mensaje', {
            title:      'Propiedad no encontrada',
            msg:        'La propiedad que intentas eliminar no existe.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    if (propiedad.usuarioId !== usuarioId) {
        return res.render('templates/mensaje', {
            title:      'Accion no permitida',
            msg:        'No tienes permiso para eliminar esta propiedad.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    // Eliminar imagenes de Cloudinary antes de borrar el registro
    const ids = propiedad.imagenesIds || [];
    for (const publicId of ids) {
        await cloudinary.uploader.destroy(publicId).catch(e => console.error('[Cloudinary] Error eliminando:', e.message));
    }

    await propiedad.destroy();

    return res.redirect('/propiedades?eliminada=1');
});


// ─────────────────────────────────────────────────────────────────
// READ — Detalle de propiedad
// ─────────────────────────────────────────────────────────────────

const verPropiedad = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) {
        return res.render('templates/mensaje', {
            pagina:     'Propiedad no encontrada',
            title:      'Propiedad no encontrada',
            msg:        'La propiedad que buscas no existe o fue eliminada.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    // Solo el dueño puede ver el detalle
    if (propiedad.usuarioId !== usuarioId) {
        return res.render('templates/mensaje', {
            pagina:     'Acceso no permitido',
            title:      'Acceso no permitido',
            msg:        'No tienes permiso para ver esta propiedad.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.render('propiedades/detalle', {
        pagina:    propiedad.titulo,
        propiedad,
        esDueno:   propiedad.usuarioId === usuarioId
    });
});

// ─────────────────────────────────────────────────────────────────
// UPDATE — Cambiar estatus de propiedad (activa → inactiva → vendida → activa)
// ─────────────────────────────────────────────────────────────────

const CICLO_ESTATUS = { activa: 'inactiva', inactiva: 'vendida', vendida: 'activa' };

const cambiarEstatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuarioActual?.id || req.session?.usuario?.id || req.user?.id;

    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) {
        return res.render('templates/mensaje', {
            title:      'Propiedad no encontrada',
            msg:        'La propiedad que intentas modificar no existe.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    if (propiedad.usuarioId !== usuarioId) {
        return res.render('templates/mensaje', {
            title:      'Accion no permitida',
            msg:        'No tienes permiso para modificar esta propiedad.',
            buttonURL:  '/propiedades',
            buttonText: 'Volver a mis propiedades'
        });
    }

    const nuevoEstatus = CICLO_ESTATUS[propiedad.estatus] ?? 'activa';
    await propiedad.update({ estatus: nuevoEstatus });

    return res.redirect('/propiedades?cambioEstatus=1');
});

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export {
    misPropiedades,
    formularioNuevaPropiedad,
    crearPropiedad,
    formularioEditarPropiedad,
    editarPropiedad,
    eliminarPropiedad,
    verPropiedad,
    cambiarEstatus
};