"""Stdlib validation of the meta-trial schema and its referenced definitions.

This implements the keywords used by these two bundled contracts, not general
JSON Schema. The contracts remain the source of field types and enum values.
"""
from datetime import datetime
import json
import math
from pathlib import Path
import re


def validate(value, schema, documents, document, location='$'):
    if '$ref' in schema:
        filename, _, pointer = schema['$ref'].partition('#')
        document = documents[filename] if filename else document
        target = document
        for part in pointer.strip('/').split('/') if pointer else []:
            target = target[part.replace('~1', '/').replace('~0', '~')]
        validate(value, target, documents, document, location)
    if 'anyOf' in schema:
        for alternative in schema['anyOf']:
            try:
                validate(value, alternative, documents, document, location)
                break
            except ValueError:
                pass
        else:
            raise ValueError(location+': no matching schema alternative')
    types = schema.get('type', [])
    types = [types] if isinstance(types, str) else types
    matches = dict(object=isinstance(value, dict), array=isinstance(value, list),
        string=isinstance(value, str), number=type(value) in (int,float) and math.isfinite(value),
        integer=type(value) is int, boolean=type(value) is bool, null=value is None)
    if types and not any(matches[t] for t in types):
        raise ValueError(location+': invalid type')
    if 'const' in schema and (type(value) is not type(schema['const']) or value != schema['const']):
        raise ValueError(location+': invalid constant')
    if 'enum' in schema and not any(type(value) is type(v) and value == v for v in schema['enum']):
        raise ValueError(location+': invalid enum')
    if isinstance(value, dict):
        if any(key not in value for key in schema.get('required', [])):
            raise ValueError(location+': missing required field')
        properties = schema.get('properties', {})
        if schema.get('additionalProperties') is False and set(value)-properties.keys():
            raise ValueError(location+': unexpected field')
        for key, item in value.items():
            if key in properties:
                validate(item, properties[key], documents, document, location+'.'+key)
    if isinstance(value, list):
        if schema.get('uniqueItems') and len({json.dumps(v, sort_keys=True) for v in value}) != len(value):
            raise ValueError(location+': duplicate items')
        for item in value:
            if 'items' in schema:
                validate(item, schema['items'], documents, document, location+'[]')
    if isinstance(value, str):
        if len(value) < schema.get('minLength', 0) or ('pattern' in schema and not re.search(schema['pattern'],value)):
            raise ValueError(location+': invalid string')
        if schema.get('format') == 'date-time':
            try:
                stamp = datetime.fromisoformat(value.replace('Z','+00:00'))
                if stamp.utcoffset() is None:
                    raise ValueError('missing timezone')
            except ValueError as exc:
                raise ValueError(location+': invalid timestamp') from exc
    if type(value) in (int,float) and ('minimum' in schema and value < schema['minimum']):
        raise ValueError(location+': below minimum')


def load_validator():
    folder = Path(__file__).with_name('schemas')
    if not folder.is_dir():
        folder = Path(__file__).resolve().parents[1]/'templates'
    documents = {name: json.loads((folder/name).read_text())
                 for name in ('rounds.schema.json','meta-trial.schema.json')}
    schema = documents['meta-trial.schema.json']
    return lambda value: validate(value, schema, documents, schema)
