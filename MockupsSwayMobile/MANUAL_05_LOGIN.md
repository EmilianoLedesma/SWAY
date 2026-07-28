# 5.1 LoginScreen — Inicio de Sesión

**Archivo:** `src/screens/LoginScreen.js`

**Función principal:** Autenticación de usuarios colaboradores.

**Objetivos:**
- Permitir al colaborador iniciar sesión con correo y contraseña
- Permitir crear una cuenta nueva
- Validar que los campos obligatorios estén completos
- Confirmar que las contraseñas coincidan en el registro

**Elementos de la interfaz:**
1. Logo SWAY centrado en la parte superior
2. Título "Iniciar Sesión" o "Crear Cuenta" según el modo
3. Campo: Nombre completo (solo en registro)
4. Campo: Correo electrónico (teclado tipo email)
5. Campo: Contraseña (oculta)
6. Campo: Confirmar contraseña (solo en registro)
7. Enlace "¿Olvidaste tu contraseña?" (solo en login)
8. Botón principal: "Iniciar Sesión" / "Crear Cuenta"
9. Indicador de carga mientras se procesa la autenticación
10. Separador "o"
11. Enlace de alternancia entre login y registro
12. Banner de error en caso de validación fallida

**Comportamiento:**
- El formulario se adapta con `KeyboardAvoidingView` para evitar que el teclado opaque los campos
- Los campos de contraseña usan `secureTextEntry` para ocultar el texto
- Al enviar, se muestra un `ActivityIndicator` y se deshabilita el botón
- Los errores se muestran en un banner rojo sobre el formulario
