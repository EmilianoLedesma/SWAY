from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.data.database import get_db, Base
from app.security.api_key import require_api_key
from app.data.models import Estatus

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(engine)

db = TestSession()
if not db.query(Estatus).filter(Estatus.nombre == "Cancelado").first():
    db.add(Estatus(nombre="Cancelado"))
    db.commit()
db.close()


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[require_api_key] = lambda: True
