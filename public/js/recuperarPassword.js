const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var yaEnviado = false;

function marcarError(inputId, errId, mensaje) {
    document.getElementById(inputId).classList.add('border-red-400');
    document.getElementById(inputId).classList.remove('border-purple-200');
    const e = document.getElementById(errId);
    e.textContent = mensaje;
    e.classList.remove('hidden');
}
function limpiarError(inputId, errId) {
    document.getElementById(inputId).classList.remove('border-red-400');
    document.getElementById(inputId).classList.add('border-purple-200');
    document.getElementById(errId).classList.add('hidden');
}

document.getElementById('emailUsuario').addEventListener('blur', function () {
    const v = this.value.trim();
    if (!v) marcarError('emailUsuario','err-email','El correo es obligatorio.');
    else if (!regexEmail.test(v)) marcarError('emailUsuario','err-email','Ingresa un correo válido.');
    else limpiarError('emailUsuario','err-email');
});

document.getElementById('formRecuperar').addEventListener('submit', function (e) {
    const email = document.getElementById('emailUsuario').value.trim();
    if (!email) { marcarError('emailUsuario','err-email','El correo es obligatorio.'); e.preventDefault(); return; }
    if (!regexEmail.test(email)) { marcarError('emailUsuario','err-email','Ingresa un correo válido.'); e.preventDefault(); return; }
    limpiarError('emailUsuario','err-email');

    if (yaEnviado) { e.preventDefault(); return; }
    yaEnviado = true;

    var btn     = document.getElementById('btnEnviar');
    var texto   = document.getElementById('btnTexto');
    var spinner = document.getElementById('btnSpinner');
    btn.disabled = true;
    btn.classList.remove('hover:bg-purple-600','hover:text-white','cursor-pointer');
    btn.classList.add('opacity-60','cursor-not-allowed');
    texto.textContent = 'Enviando...';
    spinner.classList.remove('hidden');

    setTimeout(function () {
        btn.disabled = false;
        btn.classList.add('hover:bg-purple-600','hover:text-white','cursor-pointer');
        btn.classList.remove('opacity-60','cursor-not-allowed');
        texto.textContent = 'Enviar Correo de Restauración';
        spinner.classList.add('hidden');
        yaEnviado = false;
    }, 10000);
});