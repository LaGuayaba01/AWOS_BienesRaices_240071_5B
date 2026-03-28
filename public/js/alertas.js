(function () {

    // ── Configuración ──────────────────────────────────────────────
    const DURACION_MS       = 4000;   // tiempo de vida normal
    const DELAY_HOVER_MS    = 2500;   // tiempo extra al soltar el mouse
    const ANIMACION_SALIDA  = 300;

    const TEMAS = {
        error: {
            bg:     'bg-red-50',
            borde:  'border-red-400',
            texto:  'text-red-700',
            barra:  'bg-red-400',
            icono:  '✕'
        },
        advertencia: {
            bg:     'bg-yellow-50',
            borde:  'border-yellow-400',
            texto:  'text-yellow-700',
            barra:  'bg-yellow-400',
            icono:  '⚠'
        },
        exito: {
            bg:     'bg-green-50',
            borde:  'border-green-400',
            texto:  'text-green-700',
            barra:  'bg-green-400',
            icono:  '✓'
        },
        info: {
            bg:     'bg-blue-50',
            borde:  'border-blue-400',
            texto:  'text-blue-700',
            barra:  'bg-blue-400',
            icono:  'i'
        }
    };

    // ── Contenedor global ──────────────────────────────────────────
    function obtenerContenedor() {
        let c = document.getElementById('alertas-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'alertas-container';
            c.style.cssText = [
                'position:fixed',
                'top:16px',
                'right:16px',
                'z-index:9999',
                'display:flex',
                'flex-direction:column',
                'gap:8px',
                'width:320px',
                'max-width:calc(100vw - 32px)',
                'pointer-events:none'   // el contenedor no bloquea clics en la página
            ].join(';');
            document.body.appendChild(c);
        }
        return c;
    }

    // ── Cerrar con animación ───────────────────────────────────────
    function cerrarAlerta(tarjeta, delay) {
        if (tarjeta._cerrando) return;
        tarjeta._cerrando = true;
        setTimeout(function () {
            tarjeta.style.opacity   = '0';
            tarjeta.style.transform = 'translateY(-8px)';
            setTimeout(function () { tarjeta.remove(); }, ANIMACION_SALIDA);
        }, delay || 0);
    }

    // ── Crear una alerta ───────────────────────────────────────────
    function CrearAlerta(mensaje, tipo) {
        const tema      = TEMAS[tipo] || TEMAS.info;
        const contenedor = obtenerContenedor();

        // Tarjeta — pointer-events:auto para que esta sí sea interactiva
        const tarjeta = document.createElement('div');
        tarjeta.style.cssText = [
            'opacity:0',
            'transform:translateY(-12px)',
            'transition:opacity 0.3s ease, transform 0.3s ease',
            'border-radius:12px',
            'overflow:hidden',
            'box-shadow:0 4px 12px rgba(0,0,0,0.1)',
            'position:relative',
            'pointer-events:auto',      // permite seleccionar texto y hover
            'user-select:text',         // permite seleccionar el mensaje
            '-webkit-user-select:text',
            'cursor:default'
        ].join(';');
        tarjeta.className = tema.bg + ' border-l-4 ' + tema.borde;
        tarjeta.setAttribute('data-alerta', tipo);

        tarjeta.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;">' +
                '<span style="font-size:13px;font-weight:700;margin-top:1px;flex-shrink:0;" class="' + tema.texto + '">' + tema.icono + '</span>' +
                '<p style="flex:1;font-size:13px;font-weight:500;line-height:1.5;margin:0;user-select:text;-webkit-user-select:text;" class="' + tema.texto + '">' + mensaje + '</p>' +
                '<button title="Cerrar" style="background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 2px;margin-top:-2px;opacity:0.45;flex-shrink:0;" class="' + tema.texto + '" onclick="(function(b){' +
                    'var t=b.closest(\'[data-alerta]\');' +
                    'if(t){t._cerrando=false;t.style.opacity=\'0\';t.style.transform=\'translateY(-8px)\';setTimeout(function(){t.remove();},300);}' +
                '})(this)">×</button>' +
            '</div>' +
            '<div style="height:3px;width:100%;background:#e5e7eb;position:relative;">' +
                '<div class="barra-progreso ' + tema.barra + '" style="height:100%;width:100%;transition:width ' + DURACION_MS + 'ms linear;"></div>' +
            '</div>';

        contenedor.appendChild(tarjeta);

        // Animación de entrada
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                tarjeta.style.opacity   = '1';
                tarjeta.style.transform = 'translateY(0)';
            });
        });

        // Barra de progreso
        var barra     = tarjeta.querySelector('.barra-progreso');
        var timerId   = null;
        var pausado   = false;

        function iniciarCierre() {
            if (tarjeta._cerrando) return;
            timerId = setTimeout(function () { cerrarAlerta(tarjeta); }, DURACION_MS);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    barra.style.width = '0%';
                });
            });
        }

        iniciarCierre();

        // Hover: pausar mientras el mouse está encima
        tarjeta.addEventListener('mouseenter', function () {
            if (tarjeta._cerrando) return;
            pausado = true;
            clearTimeout(timerId);
            // Congelar la barra en su posición actual
            var computed = window.getComputedStyle(barra).width;
            barra.style.transition = 'none';
            barra.style.width      = computed;
        });

        // Al soltar el mouse: dar DELAY_HOVER_MS ms adicionales para leer
        tarjeta.addEventListener('mouseleave', function () {
            if (tarjeta._cerrando) return;
            pausado = false;
            clearTimeout(timerId);
            timerId = setTimeout(function () { cerrarAlerta(tarjeta); }, DELAY_HOVER_MS);
            // Reanudar barra
            barra.style.transition = 'width ' + DELAY_HOVER_MS + 'ms linear';
            barra.style.width      = '0%';
        });
    }

    // ── Exponer globalmente ────────────────────────────────────────
    window.mostrarAlerta = CrearAlerta;

    // ── Leer alertas inyectadas por el servidor al cargar ─────────
    document.addEventListener('DOMContentLoaded', function () {
        var errores = document.querySelectorAll('[data-alerta-error]');
        var exitos  = document.querySelectorAll('[data-alerta-exito]');
        var avisos  = document.querySelectorAll('[data-alerta-advertencia]');
        var infos   = document.querySelectorAll('[data-alerta-info]');

        setTimeout(function () {
            errores.forEach(function (el) { CrearAlerta(el.dataset.alertaError,         'error');       });
            avisos.forEach(function  (el) { CrearAlerta(el.dataset.alertaAdvertencia,   'advertencia'); });
            exitos.forEach(function  (el) { CrearAlerta(el.dataset.alertaExito,         'exito');       });
            infos.forEach(function   (el) { CrearAlerta(el.dataset.alertaInfo,          'info');        });
        }, 150);
    });

})();
