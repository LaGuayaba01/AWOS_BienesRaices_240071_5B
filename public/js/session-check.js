/**
 * session-check.js
 * ─────────────────────────────────────────────────────────────────
 * Detecta cuando la sesión del usuario ha expirado mientras navega
 * y muestra un aviso antes de redirigir al login.
 *
 * Cómo funciona:
 *  - Cada 2 minutos hace un ping a /auth/ping (endpoint ligero)
 *  - Si el servidor responde 401 → la sesión expiró
 *  - Muestra una alerta de advertencia con cuenta regresiva de 5s
 *  - Redirige automáticamente al login al terminar la cuenta
 * ─────────────────────────────────────────────────────────────────
 */
(function () {

    var INTERVALO_MS  = 2 * 60 * 1000; // revisar cada 2 minutos
    var CUENTA_REGRESIVA = 5;           // segundos antes de redirigir
    var yaAvisado = false;

    function revisarSesion() {
        // No revisar si ya se mostró el aviso
        if (yaAvisado) return;

        fetch('/auth/ping', {
            method:      'GET',
            credentials: 'same-origin',
            headers:     { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (res) {
            if (res.status === 401) {
                mostrarAvisoExpiracion();
            }
        })
        .catch(function () {
            // Error de red — no hacer nada, el offline-registro lo maneja
        });
    }

    function mostrarAvisoExpiracion() {
        if (yaAvisado) return;
        yaAvisado = true;

        var segundos = CUENTA_REGRESIVA;

        // Usar el sistema de alertas existente si está disponible
        if (window.mostrarAlerta) {
            window.mostrarAlerta(
                'Tu sesión ha expirado. Serás redirigido al login en ' + segundos + ' segundos...',
                'advertencia'
            );
        }

        // Cuenta regresiva con actualización del mensaje
        var intervalo = setInterval(function () {
            segundos--;

            if (segundos <= 0) {
                clearInterval(intervalo);
                window.location.href = '/auth/login?expirado=1';
                return;
            }

            // Actualizar el mensaje en la alerta existente
            var alertas = document.querySelectorAll('[data-alerta="advertencia"] p');
            alertas.forEach(function (p) {
                if (p.textContent.includes('sesión ha expirado')) {
                    p.textContent = 'Tu sesión ha expirado. Serás redirigido al login en ' + segundos + ' segundos...';
                }
            });
        }, 1000);
    }

    // Iniciar revisión periódica solo si hay una sesión activa
    // (el elemento #session-active lo inyecta el layout cuando hay usuario)
    document.addEventListener('DOMContentLoaded', function () {
        var hayUsuario = document.getElementById('session-active');
        if (!hayUsuario) return;

        // Primera revisión después de 2 minutos
        setInterval(revisarSesion, INTERVALO_MS);

        // También revisar cuando el usuario vuelve a la pestaña
        // (puede que la sesión haya expirado mientras estaba en otra pestaña)
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                revisarSesion();
            }
        });
    });

})();
