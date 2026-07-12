# Resume parser service — pdfplumber + python-docx + spaCy + JD templates
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
# Install the spaCy model wheel together with requirements so pip resolves a
# spaCy version compatible with en_core_web_sm 3.8.0.
RUN pip install --no-cache-dir -r requirements.txt \
    https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl

COPY main.py jd_generator.py ./

RUN useradd --create-home appuser
USER appuser

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
