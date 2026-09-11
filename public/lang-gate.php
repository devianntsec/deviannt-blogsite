<?php
// static/lang-gate.php
// Decide el idioma en la primera visita a "/", usando el país que Cloudflare
// ya resuelve por IP (CF-IPCountry) — sin llamar a ninguna API externa.

$spanishCountries = ['ES','MX','CO','AR','PE','VE','CL','EC','GT','CU','BO',
                      'DO','HN','PY','SV','NI','CR','PA','UY','GQ'];

$country = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? null;

if ($country && $country !== 'XX' && $country !== 'T1') {
    // XX = Cloudflare no pudo determinar el país, T1 = red Tor
    $lang = in_array($country, $spanishCountries) ? 'es' : 'en';
} else {
    // Fallback: si por lo que sea no llega el header (ej. bypass de Cloudflare),
    // se usa el idioma del navegador — mismo fallback que ya usa deviannt.com
    $accept = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'en';
    $lang = (stripos($accept, 'es') === 0 || stripos($accept, ',es') !== false) ? 'es' : 'en';
}

// Guardar la decisión 1 año — evita recalcular en cada visita y respeta
// para siempre cualquier cambio manual que el visitante haga después
setcookie('blog_lang', $lang, time() + 60*60*24*365, '/', '', true, true);
header('Cache-Control: no-store'); // que Cloudflare no cachee esta respuesta

if ($lang === 'es') {
    header('Location: /es/', true, 302);
    exit;
}

// Para "en" no hace falta redirigir: servimos directo el index.html real
// que generó Hugo (mismo patrón que ya usa tu 404.php con readfile)
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');
exit;