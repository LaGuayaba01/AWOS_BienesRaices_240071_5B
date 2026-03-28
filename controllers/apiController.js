import Propiedad from '../models/Propiedad.js';
import { Op }     from 'sequelize';

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────
// HELPER — headers de respuesta API
// ─────────────────────────────────────────────────────────────────
const apiHeaders = (res) => {
    res.setHeader('Content-Type',                'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options',      'nosniff');
};

// ─────────────────────────────────────────────────────────────────
// GET /api/propiedades
// Parámetros de query:
//   pagina    = 1
//   limite    = 6 | 12 | 24
//   buscar    = texto libre
//   categoria = casa | departamento | terreno
//   ciudad    = texto
//   orden     = reciente | precio_asc | precio_desc
// ─────────────────────────────────────────────────────────────────
export const apiPropiedades = asyncHandler(async (req, res) => {
    apiHeaders(res);

    const pagina    = Math.max(1, parseInt(req.query.pagina)  || 1);
    const limite    = [6, 12, 24].includes(parseInt(req.query.limite))
                      ? parseInt(req.query.limite) : 6;
    const buscar    = (req.query.buscar    || '').trim();
    const categoria = (req.query.categoria || '').trim();
    const ciudad    = (req.query.ciudad    || '').trim();
    const orden     = req.query.orden || 'reciente';
    const offset    = (pagina - 1) * limite;

    // ── Filtros ──────────────────────────────────────────────────
    const where = { estatus: 'activa' };

    if (buscar)    where[Op.or] = [
        { titulo:    { [Op.like]: `%${buscar}%`  } },
        { ciudad:    { [Op.like]: `%${buscar}%`  } },
        { direccion: { [Op.like]: `%${buscar}%`  } }
    ];
    if (categoria) where.categoria = categoria;
    if (ciudad)    where.ciudad    = { [Op.like]: `%${ciudad}%` };

    // ── Ordenamiento ─────────────────────────────────────────────
    const orderMap = {
        reciente:    [['created_at', 'DESC']],
        precio_asc:  [['precio',     'ASC']],
        precio_desc: [['precio',     'DESC']]
    };
    const order = orderMap[orden] || orderMap.reciente;

    // ── Consulta ─────────────────────────────────────────────────
    const { count, rows } = await Propiedad.findAndCountAll({
        where,
        order,
        limit:  limite,
        offset,
        attributes: [
            'id', 'titulo', 'descripcion', 'precio',
            'habitaciones', 'banos', 'estacionamientos',
            'direccion', 'ciudad', 'categoria', 'estatus',
            'imagenes', 'created_at'
        ]
    });

    const totalPaginas = Math.ceil(count / limite);

    res.status(200).json({
        ok: true,
        total:        count,
        pagina,
        totalPaginas,
        limite,
        propiedades:  rows.map(serializarPropiedad)
    });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/propiedades/:id
// ─────────────────────────────────────────────────────────────────
export const apiPropiedad = asyncHandler(async (req, res) => {
    apiHeaders(res);

    const propiedad = await Propiedad.findOne({
        where: {
            id:      req.params.id,
            estatus: 'activa'
        },
        attributes: [
            'id', 'titulo', 'descripcion', 'precio',
            'habitaciones', 'banos', 'estacionamientos',
            'direccion', 'ciudad', 'categoria', 'estatus',
            'imagenes', 'created_at'
        ]
    });

    if (!propiedad) {
        return res.status(404).json({
            ok:      false,
            mensaje: 'Propiedad no encontrada o no disponible.'
        });
    }

    res.status(200).json({
        ok:        true,
        propiedad: serializarPropiedad(propiedad)
    });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/categorias
// ─────────────────────────────────────────────────────────────────
export const apiCategorias = asyncHandler(async (req, res) => {
    apiHeaders(res);

    // Contar activas por categoría
    const conteos = await Propiedad.findAll({
        where: { estatus: 'activa' },
        attributes: [
            'categoria',
            [Propiedad.sequelize.fn('COUNT', Propiedad.sequelize.col('id')), 'total']
        ],
        group: ['categoria'],
        raw:   true
    });

    const mapa = Object.fromEntries(conteos.map(r => [r.categoria, Number(r.total)]));

    const categorias = [
        { slug: 'casa',         label: 'Casas',         total: mapa.casa         || 0 },
        { slug: 'departamento', label: 'Departamentos',  total: mapa.departamento || 0 },
        { slug: 'terreno',      label: 'Terrenos',       total: mapa.terreno      || 0 }
    ];

    res.status(200).json({
        ok: true,
        categorias
    });
});

// ─────────────────────────────────────────────────────────────────
// HELPER — Serializar propiedad para la API
// ─────────────────────────────────────────────────────────────────
const serializarPropiedad = (p) => ({
    id:               p.id,
    titulo:           p.titulo,
    descripcion:      p.descripcion,
    precio:           Number(p.precio),
    habitaciones:     p.habitaciones,
    banos:            p.banos,
    estacionamientos: p.estacionamientos,
    direccion:        p.direccion,
    ciudad:           p.ciudad,
    categoria:        p.categoria,
    estatus:          p.estatus,
    imagenes:         p.imagenes || [],
    creadoEn:         p.created_at
});
