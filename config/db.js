import { Sequelize } from "sequelize";
import mysql2 from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_DIALECT,
  NODE_ENV
} = process.env;

const IS_PROD = NODE_ENV === "production";

// Verificar variables de entorno requeridas
const requiredVars = { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD };
const missingVars = Object.entries(requiredVars)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missingVars.length) {
  console.error(`[ERROR] Faltan variables de entorno: ${missingVars.join(", ")}`);
  process.exit(1);
}

// Instancia de Sequelize
const sequelize = new Sequelize(
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  {
    host:    DB_HOST,
    port:    Number(DB_PORT),
    dialect: DB_DIALECT || "mysql",

    // Activa logging solo en desarrollo para ver las queries ejecutadas
    logging: IS_PROD ? false : (sql) => console.log(`[SQL] ${sql}`),
    benchmark: !IS_PROD,

    define: {
      timestamps:      true,
      underscored:     true,
      freezeTableName: true,
    },

    pool: {
      max:     10,
      min:     2,       // Mantiene 2 conexiones calientes -> evita latencia inicial
      acquire: 30000,
      idle:    10000,
      evict:   10000,   // Revisa conexiones inactivas cada 10 s
    },

    dialectOptions: {
      charset:        "utf8mb4",
      connectTimeout: 30000,    // 30 s maximo para la conexion inicial
    },

    timezone: "-06:00",
  }
);

// Crear la BD si no existe (antes de conectar Sequelize)
const ensureDatabaseExists = async () => {
  console.log(`[DB] Verificando existencia de la base de datos "${DB_NAME}"...`);

  let connection;
  try {
    // Conecta sin especificar BD para poder crearla si hace falta
    connection = await mysql2.createConnection({
      host:           DB_HOST,
      port:           Number(DB_PORT),
      user:           DB_USER,
      password:       DB_PASSWORD,
      connectTimeout: 30000,
    });

    const [rows] = await connection.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [DB_NAME]
    );

    if (rows.length === 0) {
      console.log(`[DB] La base de datos "${DB_NAME}" no existe. Creandola...`);
      await connection.query(
        `CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`[DB] Base de datos "${DB_NAME}" creada exitosamente.`);
    } else {
      console.log(`[DB] Base de datos "${DB_NAME}" ya existe.`);
    }
  } catch (err) {
    console.error(`[ERROR] Error al verificar/crear la base de datos:`, err.message);
    throw err;
  } finally {
    if (connection) await connection.end();
  }
};

// Conectar y sincronizar
export const connectDB = async () => {
  try {
    // 1. Garantizar que la BD existe antes de que Sequelize intente usarla
    await ensureDatabaseExists();

    // 2. Autenticar la conexion principal
    console.log(`[DB] Conectando a MySQL en ${DB_HOST}:${DB_PORT}...`);
    await sequelize.authenticate();
    console.log(`[DB] Conexion autenticada correctamente.`);

    // 3. Sincronizar modelos -> tablas
    console.log(`[DB] Sincronizando modelos con la base de datos...`);
    await sequelize.sync({ alter: true });
    console.log(`[DB] Tablas sincronizadas correctamente.`);

    // 4. Info del pool activo
    const pool = sequelize.connectionManager.pool;
    console.log(`[DB] Pool activo - min: ${pool.min ?? 2} | max: ${pool.max ?? 10} conexiones`);

    console.log(`[DB] Base de datos lista. Entorno: ${NODE_ENV ?? "development"}`);
  } catch (error) {
    console.error("[ERROR] Error al conectar con la base de datos:", error.message);
    if (!IS_PROD) console.error(error);
    process.exit(1);
  }
};

export default sequelize;