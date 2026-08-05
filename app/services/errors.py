from fastapi import HTTPException


def safe_500(e: Exception, context: str) -> HTTPException:
    print(f"Error en {context}: {e}")
    return HTTPException(status_code=500, detail="Ocurrió un error al procesar la solicitud.")
