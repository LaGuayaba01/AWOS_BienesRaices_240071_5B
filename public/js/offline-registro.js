
(function () {

    var DB_NAME    = 'br-offline';
    var STORE_NAME = 'registros';
    var DB_VERSION = 1;
    var ENDPOINT   = '/auth/api/registro';

    // ── Abrir / crear la base de datos IndexedDB ─────────────────
    function abrirDB() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    var store = db.createObjectStore(STORE_NAME, {
                        keyPath:       'id',
                        autoIncrement: true
                    });
                    store.createIndex('estado', 'estado', { unique: false });
                }
            };

            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror   = function (e) { reject(e.target.error); };
        });
    }

    // ── Guardar registro pendiente ────────────────────────────────
    function guardarPendiente(datos) {
        return abrirDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx    = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                var req   = store.add({
                    datos:    datos,
                    estado:   'pendiente',
                    intentos: 0,
                    creadoEn: new Date().toISOString()
                });
                req.onsuccess = function () { resolve(req.result); };
                req.onerror   = function () { reject(req.error); };
            });
        });
    }

    // ── Leer todos los pendientes ─────────────────────────────────
    function leerPendientes() {
        return abrirDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx    = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var idx   = store.index('estado');
                var req   = idx.getAll('pendiente');
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror   = function () { reject(req.error); };
            });
        });
    }

    // ── Actualizar estado de un registro ─────────────────────────
    function actualizarEstado(id, nuevoEstado, extra) {
        return abrirDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx     = db.transaction(STORE_NAME, 'readwrite');
                var store  = tx.objectStore(STORE_NAME);
                var getReq = store.get(id);
                getReq.onsuccess = function () {
                    var registro = getReq.result;
                    if (!registro) return resolve();
                    registro.estado   = nuevoEstado;
                    registro.intentos = (registro.intentos || 0) + 1;
                    if (extra) Object.assign(registro, extra);
                    var putReq = store.put(registro);
                    putReq.onsuccess = function () { resolve(); };
                    putReq.onerror   = function () { reject(putReq.error); };
                };
                getReq.onerror = function () { reject(getReq.error); };
            });
        });
    }

    // ── Enviar un registro al backend ─────────────────────────────
    function enviarAlBackend(registro) {
        return fetch(ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(registro.datos)
        })
        .then(function (res) {
            return res.json().then(function (body) {
                return { status: res.status, body: body };
            });
        });
    }

    // ── Sincronizar todos los pendientes ─────────────────────────
    function sincronizar() {
        if (!navigator.onLine) return Promise.resolve();

        return leerPendientes().then(function (pendientes) {
            if (!pendientes.length) return;

            alerta('Conexión restablecida — sincronizando tu registro...');

            var promesas = pendientes.map(function (registro) {
                return enviarAlBackend(registro)
                    .then(function (resultado) {
                        if (resultado.status === 201 || resultado.status === 200) {
                            return actualizarEstado(registro.id, 'sincronizado', {
                                sincronizadoEn: new Date().toISOString(),
                                respuesta:      resultado.body.mensaje
                            });
                        } else if (resultado.status === 409) {
                            // Correo duplicado — error lógico, no reintentable
                            return actualizarEstado(registro.id, 'fallido', {
                                error: resultado.body.errores?.[0] || 'Correo duplicado'
                            });
                        } else if (resultado.status === 422) {
                            // Validación fallida — error lógico
                            return actualizarEstado(registro.id, 'fallido', {
                                error: (resultado.body.errores || []).join(', ')
                            });
                        }
                        // Otro error de servidor — dejar pendiente para reintentar
                        return actualizarEstado(registro.id, 'pendiente');
                    })
                    .catch(function () {
                        // Error de red — dejar pendiente
                        return actualizarEstado(registro.id, 'pendiente');
                    });
            });

            return Promise.all(promesas).then(function () {
                alerta('Registro enviado correctamente.', 'exito');
            });
        }).catch(function (err) {
            console.error('[OfflineRegistro] Error en sincronización:', err);
        });
    }

    // ── Mostrar alerta usando el sistema existente (amarillo) ─────
    function alerta(msg, tipo) {
        if (window.mostrarAlerta) {
            window.mostrarAlerta(msg, tipo || 'advertencia');
        }
    }

    // ── Interceptar submit del formulario de registro ─────────────
    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('formRegistro');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            // Si hay conexión → dejar que el formulario se envíe normalmente (POST a /auth/registro)
            if (navigator.onLine) return;

            // Sin conexión → guardar en IndexedDB y NO enviar el formulario
            e.preventDefault();

            var datos = {
                nombreUsuario:       form.nombreUsuario?.value?.trim() || '',
                emailUsuario:        form.emailUsuario?.value?.trim()  || '',
                passwordUsuario:     form.passwordUsuario?.value       || '',
                confirmacionUsuario: form.confirmacionUsuario?.value   || ''
            };

            guardarPendiente(datos)
                .then(function () {
                    alerta('Sin conexión — tu registro fue guardado y se enviará automáticamente al reconectarte.');
                })
                .catch(function (err) {
                    console.error('[OfflineRegistro] Error guardando en IndexedDB:', err);
                    alerta('Error al guardar el registro offline. Intenta de nuevo.', 'error');
                });
        });

        // ── Al cargar la página: sincronizar silenciosamente si hay pendientes ──
        // Solo actúa si realmente hay algo en IndexedDB — no molesta en carga normal
        if (navigator.onLine) {
            leerPendientes().then(function (pendientes) {
                if (pendientes.length > 0) {
                    alerta('Sincronizando ' + pendientes.length + ' registro(s) guardado(s) sin conexión...');
                    sincronizar();
                }
            }).catch(function () { /* IndexedDB no disponible — ignorar */ });
        } else {
            alerta('Estás sin conexión. Tu registro se guardará localmente hasta que vuelvas a conectarte.');
        }
    });

    // ── Detectar reconexión automática ───────────────────────────
    window.addEventListener('online', function () {
        sincronizar();
    });

    // ── Detectar pérdida de conexión ─────────────────────────────
    window.addEventListener('offline', function () {
        alerta('Perdiste la conexión. Si envías el formulario, se guardará y se reintentará automáticamente.');
    });

    // Exponer para debugging en consola del navegador
    window._offlineRegistro = { sincronizar: sincronizar, leerPendientes: leerPendientes };

})();