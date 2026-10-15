// node test.cjs — reglas de qué servicio ofrecer según el carrito
const assert = require("node:assert/strict");
const { sugerirServicio: s } = require("./chispa-tecnico.js");
const it = (nombre, categoria, cantidad = 1) => ({ nombre, categoria, cantidad, codigo: "X" });
const SOLAR = "Energía Solar Fotovoltaica";

assert.equal(s([]), null, "carrito vacío");
assert.equal(s([it("Tubo LED 18W", "Iluminación")]), null, "un bombillo no pide técnico");
assert.equal(s([it("Panel solar 550W", SOLAR)]), null, "un solo panel, sin combinación");
assert.equal(s([it("Panel solar 550W", SOLAR), it("Inversor híbrido 5kW", SOLAR)]).id, "solar", "panel + inversor");
assert.equal(s([it("Panel solar 550W", SOLAR), it("Inversor híbrido 5kW", SOLAR)]).fuerza, 3);
assert.equal(s([it("Batería 100Ah", SOLAR), it("Cable fotovoltaico 6mm", SOLAR)]).id, "solar", "dos piezas solares");
assert.equal(s([it("Transformador 50 kVA", "Transformadores")]).id, "transformador", "un transformador basta");
assert.equal(s([it("Gabinete metálico", "Tableros, Cajas y Gabinetes"), it("Tubo PVC 1/2", "Tubería Conduit PVC")]).id, "tablero");
assert.equal(s([it("Varilla cobre", "Materiales Puesta a Tierra")]), null, "puesta a tierra sola es fuerza 2 y un área");
assert.equal(s([it("Varilla cobre", "Materiales Puesta a Tierra"), it("Conector tipo pin", "Conectores y Terminales")]).id, "tierra");
assert.equal(s([it("Panel LED", "Iluminación", 6), it("Tubo PVC", "Tubería Conduit PVC")]).id, "luz", "6 luminarias + otra área");
assert.equal(s([it("Tubo PVC", "Tubería Conduit PVC"), it("Conector", "Conectores y Terminales"), it("Panel LED", "Iluminación")]).id, "obra", "tres áreas sueltas");
assert.equal(s([it("Transformador", "Transformadores"), it("Panel solar", SOLAR), it("Inversor", SOLAR)]).fuerza, 3, "gana la de más fuerza");
assert.equal(s([{ nombre: "" }, null, "x"]), null, "basura en el carrito");
console.log("ok: reglas de servicio");
