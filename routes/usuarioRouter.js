import express from 'express';
import {
  formularioLogin,
  formularioRecuperacion,
  formularioRegistro,
  registrarUsuario,
  paginaConfirmacion,
  formularioActualizacionPassword,
  resetearPassword
} from '../controllers/usuarioController.js';

const router = express.Router();

/* ============================
   RUTAS GET
   ============================ */
router.get("/login", formularioLogin);
router.get("/registro", formularioRegistro);
router.get("/recuperarPassword", formularioRecuperacion);
router.get("/confirma/:token", paginaConfirmacion);
router.get("/actualizarPassword/:token", formularioActualizacionPassword);



/* ============================
   RUTAS POST
   ============================ */
router.post("/registro", registrarUsuario);
router.post("/recuperarPassword/",resetearPassword);

// Ejemplo de creación rápida (solo demostración)
router.post("/createUser", (req, res) => {
  console.log("Se está procesando una petición POST");
  const nuevoUsuario = {
    nombre: "Marco A. Ramírez",
    correo: "marco@gmail.com"
  };

  res.json({
    status: 200,
    message: `Se ha solicitado la creación de un nuevo usuario con nombre: ${nuevoUsuario.nombre} y correo: ${nuevoUsuario.correo}`
  });
});

/* ============================
   RUTAS PUT
   ============================ */
router.put("/actualizarOferta", (req, res) => {
  console.log("Se está procesando una petición PUT");
  const mejorOfertaCompra = {
    clienteID: 5158,
    propiedad: 1305,
    montoOfertado: "$125,300.00"
  };

  const nuevaOferta = {
    clienteID: 1578,
    propiedad: 1305,
    montoOfertado: "$130,000.00"
  };

  res.json({
    status: 200,
    message: `Se ha actualizado la mejor oferta, de ${mejorOfertaCompra.montoOfertado} a ${nuevaOferta.montoOfertado} por el cliente: ${mejorOfertaCompra.clienteID}`
  });
});

/* ============================
   RUTAS PATCH
   ============================ */
router.patch("/actualizarPassword/:nuevoPassword", (req, res) => {
  console.log("Se está procesando una petición PATCH");
  const usuario = {
    nombre: "Damián Romero",
    correo: "d.romero@gmail.com",
    password: "123456789"
  };

  const { nuevoPassword } = req.params;
  res.json({
    status: 200,
    message: `La contraseña: ${usuario.password} ha sido actualizada a: ${nuevoPassword}`
  });
});

/* ============================
   RUTAS DELETE
   ============================ */
router.delete("/borrarPropiedad/:id", (req, res) => {
  console.log("Se está procesando una petición DELETE");
  const { id } = req.params;
  res.json({
    status: 200,
    message: `Se ha eliminado la propiedad con id: ${id}`
  });
});

export default router;
