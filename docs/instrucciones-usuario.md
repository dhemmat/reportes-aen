# Instrucciones para la tesorera (versión original)

Estas son las instrucciones que se enviaron con la primera entrega del reporte (V1).
Se conservan aquí textualmente como referencia de cómo se le explicó el flujo a la usuaria.

- **Reporte:** https://dhemmat.github.io/reportes-aen/
- **Video de demostración:** https://www.loom.com/share/995a2d4834d04fea9cee680f49120d5f

---

Hola Mónica,

Te comparto el enlace al reporte financiero de la Asamblea, junto con las instrucciones para usarlo cada mes. También encontrarás un video corto mostrando cómo funciona.

🔗 Reporte: https://dhemmat.github.io/reportes-aen/
📹 Video de demostración: https://www.loom.com/share/995a2d4834d04fea9cee680f49120d5f

──────────────────────────────────────
PASO 1 — Descargar el listado de transacciones desde QBO
──────────────────────────────────────

1. Entra a QuickBooks Online y ve a Informes en el menú lateral izquierdo.
2. En el buscador de informes, escribe "Lista de transacciones por fecha" y selecciónalo.
3. Ajusta el período: establece la fecha de inicio y la fecha de fin según el mes o rango que quieras analizar (por ejemplo, 01/01/2025 al 31/12/2025 para el año completo).
4. Haz clic en Ejecutar informe.
5. En la esquina superior derecha del informe, haz clic en el ícono de exportar y selecciona Exportar a Excel.
6. Guarda el archivo .xlsx en tu computadora.

──────────────────────────────────────
PASO 2 — Descargar el Balance General desde QBO
──────────────────────────────────────

1. En Informes, busca "Balance General" y selecciónalo.
2. En la parte superior del informe, busca la opción "Mostrar columnas por" y selecciona Mes. Esto genera una sola tabla con el saldo de cada cuenta en cada mes.
3. Ajusta el período al mismo rango de fechas que usaste en el paso anterior.
4. Haz clic en Ejecutar informe.
5. Exporta a Excel igual que antes y guarda el archivo .xlsx.

──────────────────────────────────────
PASO 3 — Usar el reporte
──────────────────────────────────────

1. Abre el enlace: https://dhemmat.github.io/reportes-aen/
2. Verás dos zonas para subir archivos:
   • Transacciones → sube el archivo de "Lista de transacciones por fecha"
   • Balance General → sube el archivo de "Balance General"
3. Haz clic en Generar reporte.
4. El reporte se divide en tres pestañas:
   • 📥 Ingresos – contribuciones por categoría (Creyentes, Asambleas, Consejeros) con gráfico y tabla desglosada por mes.
   • 📤 Gastos – gastos por categoría con gráfico y tabla desglosada por mes.
   • 🏦 Balance – saldos de cuentas bancarias, fondos marcados y fondos propios.
5. Usa los filtros en la parte superior para ajustar el período (puedes usar los atajos como "Últimos 3 meses", "Este año", etc.) y para cambiar la agrupación entre Mensual, Trimestral o Anual.
6. Los datos no se guardan en ningún servidor — todo se procesa localmente en tu navegador, así que la información de la Asamblea es completamente privada.

Nota: Para tener el reporte actualizado, es importante descargar y subir las ultimas transacciones y blancas general. Te estoy enviando adjunto aquí mismo los dos con fecha de hoy para que los puedas usar para probar. Asegúrate porfa de subir el correcto en cada cajita.

Si tienes alguna pregunta o algo no funciona como esperas, no dudes en escribirme.

Saludos,

Riaz

---

## Añadido después de la primera entrega

**Descargar el reporte en PDF.** En la parte superior derecha del reporte hay un botón
**⬇ Descargar PDF**. Antes de usarlo conviene ajustar los filtros de período y agrupación,
porque el PDF sale con lo que esté seleccionado en ese momento. El documento incluye las
tres pestañas completas —Ingresos, Gastos y Balance— cada una empezando en una página
nueva, e indica en la cabecera el período y la agrupación que se usaron.

Al pulsar el botón se abre el diálogo de impresión del navegador: ahí hay que elegir
**"Guardar como PDF"** como destino. En orientación horizontal, que es la predeterminada,
las tablas de muchos meses se reparten en bloques de 12 columnas para que se puedan leer.

## Notas de implementación derivadas de estas instrucciones

- El paso "Mostrar columnas por → Mes" del Balance General **no es opcional**. El parser
  espera una columna por mes; un Balance General de una sola fecha no se puede leer.
- La advertencia "asegúrate de subir el correcto en cada cajita" refleja una limitación real:
  la aplicación no valida que el archivo de transacciones no se haya subido en la caja del
  balance ni viceversa. Ver "Limitaciones conocidas" en el [README](../README.md).
- El rango de fechas que se elija en QBO define el rango máximo del reporte. Los filtros de
  la interfaz solo pueden reducir ese rango, nunca ampliarlo.
