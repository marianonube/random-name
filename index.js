import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- CONFIGURACIÓN DE SESIÓN ---
const SESS = {
    auth_cookie: "TU_COOKIE_AQUI", 
    internal_context: "TU_CONTEXTO_CON_!", 
    session_id: "TU_SID", 
    build_id: "TU_BL"
};

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

/**
 * VISOR DINÁMICO: 
 * Usa la lógica nativa de JSON para limpiar cualquier caracter escapado o Unicode.
 */
function limpiarRespuesta(textoBruto) {
    if (!textoBruto) return "";
    try {
        let limpio = JSON.parse(`"${textoBruto}"`);
        
        if (limpio.includes('\\u00')) {
            limpio = JSON.parse(`"${limpio}"`);
        }

        return limpio
            .replace(/\\n/g, '\n') // Arregla saltos de línea
            .replace(/\\"/g, '"')  // Arregla comillas
            .trim();
    } catch (e) {
        return textoBruto.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\n/g, '\n');
    }
}

/**
 * Ejecuta comandos del sistema de forma segura
 */
async function ejecutarComando(comando) {
    console.log('⚙️ Ejecutando comando...');
    try {
        const { stdout, stderr } = await execAsync(comando, { timeout: 30000 });
        
        if (stderr && !stdout) {
            return `Error: ${stderr}`;
        }
        
        return stdout || 'Comando ejecutado sin salida visible.';
    } catch (error) {
        return `Error al ejecutar comando: ${error.message}`;
    }
}

/**
 * Detecta si el usuario quiere ejecutar un comando
 * Comandos especiales comienzan con ! o /exec
 */
function esComando(input) {
    return input.startsWith('!') || input.startsWith('/exec ');
}

function extraerComando(input) {
    if (input.startsWith('!')) {
        return input.substring(1).trim();
    }
    if (input.startsWith('/exec ')) {
        return input.substring(6).trim();
    }
    return null;
}

async function llamarGemini(query) {
    const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=${SESS.build_id}&f.sid=${SESS.session_id}&hl=es-419&_reqid=2202684&rt=c`;
    
    // Mantenemos la instrucción para que hable libremente pero evite ensuciar con Markdown
    const instruccionSinMarkdown = " (IMPORTANTE: Explica detalladamente todo lo que necesites, pero NO utilices bloques de código con comillas invertidas ni ningún tipo de formato Markdown)";
    const queryModificada = query + instruccionSinMarkdown;

    const struct = [
        [queryModificada, 0, null, null, null, null, 0],
        ["es-419"],
        ["", "", "", null, null, null, null, null, null, ""],
        SESS.internal_context,
        "eb594bcd367d878b1514dd3b7c68bb91"
    ];

    const payload = `f.req=${encodeURIComponent(JSON.stringify([null, JSON.stringify(struct)]))}&at=`;

    try {
        const response = await client.post(url, payload, {
            headers: {
                "Cookie": SESS.auth_cookie,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Same-Domain": "1",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const matches = [...response.data.matchAll(/rc_[a-z0-9]+.*?\[\\"(.*?)\\"\]/g)];
        
        if (matches.length > 0) {
            const contenido = matches[matches.length - 1][1];
            return limpiarRespuesta(contenido);
        } else {
            return "Error: No se pudo extraer el contenido.";
        }
    } catch (e) { 
        return `Error: ${e.message}`; 
    }
}

// Configuración de la interfaz de la consola interactiva
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function iniciarChat() {
    rl.question('\n👤 Tú: ', async (input) => {
        // Si escribes "salir", cerramos el programa
        if (input.toLowerCase() === 'salir' || input.toLowerCase() === 'exit') {
            console.log('👋 ¡Nos vemos!');
            rl.close();
            process.exit(0);
        }

        if (input.trim() === '') {
            iniciarChat();
            return;
        }

        // Verificar si es un comando a ejecutar
        if (esComando(input)) {
            const comando = extraerComando(input);
            console.log('⚙️ Sistema: Ejecutando...');
            const resultado = await ejecutarComando(comando);
            
            readline.moveCursor(process.stdout, 0, -1);
            readline.clearLine(process.stdout, 0);
            console.log(`⚙️ Resultado:\n${resultado}`);
            iniciarChat();
            return;
        }

        console.log('🤖 Gemini: Pensando...');
        const respuesta = await llamarGemini(input);
        
        // Borramos la línea de "Pensando..." y ponemos la respuesta real
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
        console.log(`🤖 Gemini:\n${respuesta}`);
        
        // Volvemos a preguntar de forma infinita
        iniciarChat();
    });
}

// Mensaje de bienvenida inicial
console.clear();
console.log("🚀 MODO CHAT DIRECTO CON EJECUCIÓN DE COMANDOS");
console.log("------------------------------------------");
console.log("Escribe tu pregunta y presiona Enter.");
console.log("Para ejecutar comandos usa: !comando  o  /exec comando");
console.log("Ejemplos: !dir, !ls, !pwd, !echo Hola");
console.log("Para cerrar el programa escribe: salir");
console.log("------------------------------------------");

iniciarChat();
