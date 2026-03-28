/**
 * theme.js
 * ─────────────────────────────────────────────────────────────────
 * Manejo de tema oscuro/claro con:
 *  - Persistencia en localStorage
 *  - Sincronización en tiempo real entre pestañas (BroadcastChannel + storage event)
 *  - Aplicación ANTES del renderizado (cargado en <head>) → sin parpadeo
 *  - Iconos duales (luna / sol) actualizados en cada cambio
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
    var CLAVE = 'br-tema';
    var channel = null;

    // ── Inicializar BroadcastChannel (si el navegador lo soporta) ─
    try {
        channel = new BroadcastChannel('br-tema-sync');
    } catch (e) {
        // Safari antiguo / entornos sin soporte → fallback con storage event
    }

    // ── Leer preferencia ─────────────────────────────────────────
    function getTema() {
        var guardado = localStorage.getItem(CLAVE);
        if (guardado === 'dark' || guardado === 'light') return guardado;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // ── Aplicar clase al <html> ───────────────────────────────────
    function aplicar(tema) {
        if (tema === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    // ── Actualizar iconos (luna / sol) en todos los botones ───────
    function actualizarIconos(tema) {
        document.querySelectorAll('[data-icon-light]').forEach(function (el) {
            el.style.display = tema === 'dark' ? 'block' : 'none';
        });
        document.querySelectorAll('[data-icon-dark]').forEach(function (el) {
            el.style.display = tema === 'dark' ? 'none' : 'block';
        });
    }

    // ── Toggle desde botón ────────────────────────────────────────
    window.toggleTema = function () {
        var nuevo = getTema() === 'dark' ? 'light' : 'dark';
        localStorage.setItem(CLAVE, nuevo);
        aplicar(nuevo);
        actualizarIconos(nuevo);

        // Notificar a otras pestañas via BroadcastChannel
        if (channel) {
            try {
                channel.postMessage({
                    tema: nuevo
                });
            } catch (e) {}
        }
    };

    // ── Sincronización entre pestañas: BroadcastChannel ──────────
    if (channel) {
        channel.onmessage = function (e) {
            if (e.data && (e.data.tema === 'dark' || e.data.tema === 'light')) {
                localStorage.setItem(CLAVE, e.data.tema);
                aplicar(e.data.tema);
                actualizarIconos(e.data.tema);
            }
        };
    }

    // ── Sincronización entre pestañas: storage event (fallback) ──
    // También útil cuando BroadcastChannel no está disponible
    window.addEventListener('storage', function (e) {
        if (e.key === CLAVE && e.newValue) {
            aplicar(e.newValue);
            actualizarIconos(e.newValue);
        }
    });

    // ── Responder a cambio del sistema operativo ─────────────────
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        // Solo respetar si el usuario no tiene preferencia guardada
        if (!localStorage.getItem(CLAVE)) {
            var t = e.matches ? 'dark' : 'light';
            aplicar(t);
            actualizarIconos(t);
        }
    });

    // ── Aplicación INMEDIATA (antes del DOMContentLoaded) ─────────
    // Esto es lo que elimina el flash de tema incorrecto.
    // El script se carga en <head> con este bloque ejecutándose síncronamente.
    aplicar(getTema());

    // Actualizar iconos una vez que el DOM esté listo
    document.addEventListener('DOMContentLoaded', function () {
        actualizarIconos(getTema());
    });
})();