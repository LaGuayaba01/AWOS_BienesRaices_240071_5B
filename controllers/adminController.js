import Usuario from "../models/Usuario.js";
import Propiedad from "../models/Propiedad.js";
import {
    Op
} from "sequelize";
import sequelize from "../config/db.js";
import cloudinary from "../config/cloudinaryConfig.js";

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────
// MIDDLEWARE: verificar que es admin
// ─────────────────────────────────────────────────────────────────
export const esAdmin = (req, res, next) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    const usuario = req.session?.usuario || req.user;

    if (!adminEmail) {
        console.error('[Admin] ADMIN_EMAIL no definido en .env');
        return res.redirect('/propiedades');
    }

    if (!usuario || usuario.email !== adminEmail) {
        return res.redirect('/propiedades');
    }

    next();
};

// ─────────────────────────────────────────────────────────────────
// DASHBOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export const dashboard = asyncHandler(async (req, res) => {

    // ── Totales generales ────────────────────────────────────────
    const [
        totalUsuarios,
        totalPropiedades,
        totalActivas,
        totalInactivas,
        totalVendidas,
        totalBloqueados
    ] = await Promise.all([
        Usuario.count(),
        Propiedad.count(),
        Propiedad.count({
            where: {
                estatus: 'activa'
            }
        }),
        Propiedad.count({
            where: {
                estatus: 'inactiva'
            }
        }),
        Propiedad.count({
            where: {
                estatus: 'vendida'
            }
        }),
        Usuario.count({
            where: {
                lockedUntil: {
                    [Op.gt]: new Date()
                }
            }
        })
    ]);

    // ── Propiedades vendidas este mes vs mes anterior ────────────
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);

    const [vendidasEsteMes, vendidasMesAnterior, topVendidas] = await Promise.all([
        Propiedad.count({
            where: {
                estatus: 'vendida',
                updated_at: {
                    [Op.gte]: inicioMes
                }
            }
        }),
        Propiedad.count({
            where: {
                estatus: 'vendida',
                updated_at: {
                    [Op.between]: [inicioMesAnterior, finMesAnterior]
                }
            }
        }),
        Propiedad.findAll({
            where: {
                estatus: 'vendida',
                updated_at: {
                    [Op.gte]: inicioMes
                }
            },
            include: [{
                model: Usuario,
                as: 'vendedor',
                attributes: ['name', 'email']
            }],
            order: [
                ['updated_at', 'DESC']
            ],
            limit: 3
        })
    ]);

    // Calcular variacion porcentual
    let variacion = 0;
    let tendencia = 'igual';
    if (vendidasMesAnterior > 0) {
        variacion = Math.round(((vendidasEsteMes - vendidasMesAnterior) / vendidasMesAnterior) * 100);
        tendencia = variacion > 0 ? 'sube' : variacion < 0 ? 'baja' : 'igual';
    } else if (vendidasEsteMes > 0) {
        variacion = 100;
        tendencia = 'sube';
    }


    // ── Datos para gráficas D3 ───────────────────────────────────

    // Ventas por mes (últimos 6 meses)
    const seisMesesAtras = new Date();
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
    seisMesesAtras.setDate(1);
    seisMesesAtras.setHours(0, 0, 0, 0);

    const [ventasPorMes, ventasPorSemana, ventasPorDia] = await Promise.all([
        sequelize.query(`
            SELECT
                DATE_FORMAT(updated_at, '%Y-%m') AS periodo,
                COUNT(*) AS total
            FROM tb_properties
            WHERE estatus = 'vendida'
              AND updated_at >= :desde
            GROUP BY DATE_FORMAT(updated_at, '%Y-%m')
ORDER BY periodo ASC
`, {
            replacements: {
                desde: seisMesesAtras
            },
            type: sequelize.QueryTypes.SELECT
        }),

        sequelize.query(`
            SELECT
                YEARWEEK(updated_at, 1) AS periodo,
                DATE_FORMAT(MIN(updated_at), '%d/%m') AS etiqueta,
                COUNT(*) AS total
            FROM tb_properties
            WHERE estatus = 'vendida'
              AND updated_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY YEARWEEK(updated_at, 1)
            ORDER BY periodo ASC
        `, {
            type: sequelize.QueryTypes.SELECT
        }),

        sequelize.query(`
            SELECT
                DATE_FORMAT(updated_at, '%Y-%m-%d') AS periodo,
                DATE_FORMAT(MIN(updated_at), '%d/%m') AS etiqueta,
                COUNT(*) AS total
            FROM tb_properties
            WHERE estatus = 'vendida'
              AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE_FORMAT(updated_at, '%Y-%m-%d')
            ORDER BY periodo ASC
        `, {
            type: sequelize.QueryTypes.SELECT
        })
    ]);

    // ── Paginación y búsqueda — Usuarios ────────────────────────
    const adminEmail    = process.env.ADMIN_EMAIL || '';
    const pagU          = Math.max(1, parseInt(req.query.pagU) || 1);
    const limU          = [10, 20, 50].includes(parseInt(req.query.limU)) ? parseInt(req.query.limU) : 10;
    const buscarU       = (req.query.buscarU || '').trim();

    const whereU = { email: { [Op.ne]: adminEmail } };
    if (buscarU) whereU[Op.or] = [
        { name:  { [Op.like]: `%${buscarU}%` } },
        { email: { [Op.like]: `%${buscarU}%` } }
    ];

    const { count: totalU, rows: usuariosRaw } = await Usuario.findAndCountAll({
        attributes: ['id', 'name', 'email', 'confirmed', 'regStatus', 'lockedUntil', 'created_at'],
        where:  whereU,
        order:  [['created_at', 'DESC']],
        limit:  limU,
        offset: (pagU - 1) * limU
    });

    const usuarios       = usuariosRaw.map(u => ({ ...u.toJSON(), esAdmin: false }));
    const totalPaginasU  = Math.ceil(totalU / limU);

    // ── Paginación y búsqueda — Propiedades ─────────────────────
    const pagP      = Math.max(1, parseInt(req.query.pagP) || 1);
    const limP      = [10, 20, 50].includes(parseInt(req.query.limP)) ? parseInt(req.query.limP) : 10;
    const buscarP   = (req.query.buscarP || '').trim();
    const catP      = (req.query.catP    || '').trim();
    const estP      = (req.query.estP    || '').trim();

    const whereP = {};
    if (buscarP) whereP[Op.or] = [
        { titulo: { [Op.like]: `%${buscarP}%` } },
        { ciudad: { [Op.like]: `%${buscarP}%` } }
    ];
    if (catP) whereP.categoria = catP;
    if (estP) whereP.estatus   = estP;

    const { count: totalP, rows: propiedades } = await Propiedad.findAndCountAll({
        where:   whereP,
        include: [{ model: Usuario, as: 'vendedor', attributes: ['name', 'email'] }],
        order:   [['created_at', 'DESC']],
        limit:   limP,
        offset:  (pagP - 1) * limP
    });

    const totalPaginasP = Math.ceil(totalP / limP);

    res.render('admin/dashboard', {
        pagina: 'Panel de Administración',
        stats: {
            totalUsuarios,
            totalPropiedades,
            totalActivas,
            totalInactivas,
            totalVendidas,
            totalBloqueados
        },
        ventas: {
            esteMes: vendidasEsteMes,
            mesAnterior: vendidasMesAnterior,
            variacion,
            tendencia,
            top: topVendidas
        },
        graficas: {
            porMes: JSON.stringify(ventasPorMes),
            porSemana: JSON.stringify(ventasPorSemana),
            porDia: JSON.stringify(ventasPorDia)
        },
        // usuarios
        usuarios,
        pagU, limU, buscarU, totalU, totalPaginasU,
        // propiedades
        propiedades,
        pagP, limP, buscarP, catP, estP, totalP, totalPaginasP
    });
});

// ─────────────────────────────────────────────────────────────────
// ACTIVAR / DESACTIVAR USUARIO
// ─────────────────────────────────────────────────────────────────
export const toggleUsuario = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const adminEmail = process.env.ADMIN_EMAIL;

    const usuario = await Usuario.findByPk(id, {
        attributes: ['id', 'email', 'regStatus']
    });

    if (!usuario) return res.redirect('/admin');

    // Evitar que el admin se desactive a sí mismo
    if (usuario.email === adminEmail) return res.redirect('/admin');

    usuario.regStatus = !usuario.regStatus;
    await usuario.save();

    res.redirect('/admin');
});

// ─────────────────────────────────────────────────────────────────
// CAMBIAR ESTATUS DE PROPIEDAD
// ─────────────────────────────────────────────────────────────────
export const cambiarEstatusPropiedad = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { estatus } = req.body;

    const propiedad = await Propiedad.findByPk(id);
    if (!propiedad) return res.redirect('/admin');

    // El admin solo controla visibilidad: activa o inactiva
    // "vendida" lo decide el dueño, no el admin
    if (!['activa', 'inactiva'].includes(estatus)) return res.redirect('/admin');

    await propiedad.update({ estatus });
    res.redirect('/admin');
});

// ─────────────────────────────────────────────────────────────────
// ELIMINAR PROPIEDAD (admin)
// ─────────────────────────────────────────────────────────────────
export const eliminarPropiedadAdmin = asyncHandler(async (req, res) => {
    const {
        id
    } = req.params;
    const propiedad = await Propiedad.findByPk(id);

    if (!propiedad) return res.redirect('/admin');

    // Eliminar imagenes de Cloudinary antes de borrar el registro
    const ids = propiedad.imagenesIds || [];
    for (const publicId of ids) {
        await cloudinary.uploader.destroy(publicId).catch(e =>
            console.error('[Cloudinary] Error eliminando:', e.message)
        );
    }

    await propiedad.destroy();
    res.redirect('/admin');
});