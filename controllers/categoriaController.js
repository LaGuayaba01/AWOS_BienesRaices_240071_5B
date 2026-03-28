import Propiedad from "../models/Propiedad.js";
import { Op } from "sequelize";

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────
// GET /categorias/:categoria — Página pública de categoría
// ─────────────────────────────────────────────────────────────────

const CATEGORIAS_VALIDAS = ['casa', 'departamento', 'terreno'];

const TITULOS = {
    casa:         'Casas',
    departamento: 'Departamentos',
    terreno:      'Terrenos'
};

const categoria = asyncHandler(async (req, res) => {

    const cat = req.params.categoria?.toLowerCase();

    // Si la categoría no es válida → 404
    if (!CATEGORIAS_VALIDAS.includes(cat)) {
        return res.status(404).render('templates/404', {
            pagina: 'Página no encontrada'
        });
    }

    // ── Parámetros ────────────────────────────────────────────────
    const pagina  = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite  = [6, 12, 24].includes(parseInt(req.query.limite)) ? parseInt(req.query.limite) : 6;
    const buscar  = (req.query.buscar || '').trim();
    const ciudad  = (req.query.ciudad || '').trim();
    const offset  = (pagina - 1) * limite;

    // ── Where ─────────────────────────────────────────────────────
    const where = { estatus: 'activa', categoria: cat };

    if (buscar) where[Op.or] = [
        { titulo:    { [Op.like]: `%${buscar}%` } },
        { ciudad:    { [Op.like]: `%${buscar}%` } },
        { direccion: { [Op.like]: `%${buscar}%` } }
    ];
    if (ciudad) where.ciudad = { [Op.like]: `%${ciudad}%` };

    // ── Consulta ──────────────────────────────────────────────────
    const { count, rows: propiedades } = await Propiedad.findAndCountAll({
        where,
        order:  [['created_at', 'DESC']],
        limit:  limite,
        offset
    });

    const totalPaginas = Math.ceil(count / limite);

    // ── Ciudades únicas para el filtro ────────────────────────────
    const ciudadesRaw = await Propiedad.findAll({
        where:      { estatus: 'activa', categoria: cat },
        attributes: ['ciudad'],
        group:      ['ciudad'],
        order:      [['ciudad', 'ASC']]
    });
    const ciudades = ciudadesRaw.map(p => p.ciudad);

    res.render('categorias/index.pug', {
        pagina:          TITULOS[cat],
        titulo:          TITULOS[cat],
        categoria:       cat,
        propiedades,
        totalResultados: count,
        paginaActual:    pagina,
        totalPaginas,
        limite,
        buscar,
        ciudadActiva:    ciudad,
        ciudades
    });
});

export { categoria };
