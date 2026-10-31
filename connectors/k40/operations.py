"""Multi-operation jobs (lz-k40-m2/v2): vector engrave/cut and 1-bit raster.

Why a second job format: v1 carries ONE speed, ONE pass count and vector
paths only. Raster engraving and "engrave at speed A, then cut at speed B" in a
single job cannot be expressed in v1, so v1 stays byte-for-byte unchanged and
v2 is accepted alongside it.

The M2 Nano has no PWM: power is the physical panel. A raster here is on/off
(1 bit). Greyscale must be dithered in Box before it is sent.
"""
import base64
import copy
import io
import math

PROTOCOL_V2 = 'lz-k40-m2/v2'
NATIVE_MM = 0.0254           # M2 native unit: 1/1000 inch.
MAX_OPERATIONS = 12
MAX_RASTER_PIXELS = 16_000_000
MAX_RASTER_SIDE = 12_000
MAX_RASTER_BYTES = 3_000_000
VECTOR_SPEED = (1, 500)      # mm/s: grabado vectorial hasta 500; Box limita el corte a 100.
RASTER_SPEED = (10, 500)     # mm/s: máximo de grabado del láser del usuario.


def _numeric(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label}: número inválido.')
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{label}: fuera del rango {minimum}–{maximum}.')
    return value


def _passes(value, label):
    passes = _numeric(value, 1, 10, label)
    if int(passes) != passes:
        raise ValueError(f'{label}: las pasadas deben ser enteras.')
    return int(passes)


def _vector_paths(paths, bed, label):
    if not isinstance(paths, list) or not 1 <= len(paths) <= 4000:
        raise ValueError(f'{label}: cantidad de trayectorias inválida.')
    cleaned, count, length = [], 0, 0.0
    for path in paths:
        if not isinstance(path, dict) or type(path.get('closed')) is not bool:
            raise ValueError(f'{label}: trayectoria inválida.')
        points = path.get('points')
        if not isinstance(points, list) or len(points) < (3 if path['closed'] else 2):
            raise ValueError(f'{label}: faltan puntos en una trayectoria.')
        count += len(points)
        if count > 50000:
            raise ValueError(f'{label}: la operación excede 50,000 puntos.')
        ring = []
        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError(f'{label}: coordenadas inválidas.')
            ring.append([_numeric(point[0], 0, bed['width'], 'X'),
                         _numeric(point[1], 0, bed['height'], 'Y')])
        pairs = list(zip(ring, ring[1:]))
        if path['closed']:
            pairs.append((ring[-1], ring[0]))
        path_length = sum(math.dist(a, b) for a, b in pairs)
        if path_length < NATIVE_MM:
            raise ValueError(f'{label}: trayectoria demasiado pequeña para la resolución de la M2.')
        length += path_length
        cleaned.append({'points': ring, 'closed': path['closed'],
                        'role': 'hole' if path.get('role') == 'hole' else 'outer'})
    # Inside a cut, holes go first so parts do not drop before their holes.
    cleaned.sort(key=lambda p: p['role'] != 'hole')
    return cleaned, length


def _raster(raw, bed, label):
    from PIL import Image
    if not isinstance(raw, dict):
        raise ValueError(f'{label}: imagen inválida.')
    step = raw.get('step')
    if isinstance(step, bool) or not isinstance(step, int) or not 1 <= step <= 40:
        raise ValueError(f'{label}: resolución inválida (1–40 unidades de 0.0254 mm).')
    width, height = raw.get('width'), raw.get('height')
    for value, name in ((width, 'ancho'), (height, 'alto')):
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_RASTER_SIDE:
            raise ValueError(f'{label}: {name} de imagen inválido.')
    if width * height > MAX_RASTER_PIXELS:
        raise ValueError(f'{label}: la imagen excede 16 millones de puntos; reduce tamaño o resolución.')
    x = _numeric(raw.get('x'), 0, bed['width'], 'X de imagen')
    y = _numeric(raw.get('y'), 0, bed['height'], 'Y de imagen')
    size_mm = [width * step * NATIVE_MM, height * step * NATIVE_MM]
    if x + size_mm[0] > bed['width'] + 1e-6 or y + size_mm[1] > bed['height'] + 1e-6:
        raise ValueError(f'{label}: la imagen excede la cama.')
    data = raw.get('png')
    if not isinstance(data, str) or not data or len(data) > MAX_RASTER_BYTES * 4 // 3 + 4:
        raise ValueError(f'{label}: datos de imagen ausentes o demasiado grandes.')
    try:
        blob = base64.b64decode(data, validate=True)
    except Exception:
        raise ValueError(f'{label}: la imagen no está codificada correctamente.')
    if not blob.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError(f'{label}: se requiere PNG de 1 bit generado por Box.')
    previous = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = MAX_RASTER_PIXELS
    try:
        image = Image.open(io.BytesIO(blob))
        if image.format != 'PNG' or image.size != (width, height):
            raise ValueError(f'{label}: el tamaño declarado no coincide con la imagen.')
        image.load()
    except ValueError:
        raise
    except Exception:
        raise ValueError(f'{label}: no se pudo leer la imagen.')
    finally:
        Image.MAX_IMAGE_PIXELS = previous
    # 1-bit only: black (0) burns, white (255) is skipped. No greyscale "power".
    image = image.convert('L').point(lambda v: 0 if v < 128 else 255)
    burning = image.histogram()[0]
    if burning == 0:
        raise ValueError(f'{label}: la imagen no tiene puntos para grabar.')
    bidirectional = raw.get('bidirectional', True)
    if type(bidirectional) is not bool:
        raise ValueError(f'{label}: dirección de barrido inválida.')
    return {'x': x, 'y': y, 'step': step, 'width': width, 'height': height,
            'bidirectional': bidirectional, 'image': image, 'burning': burning,
            'sizeMm': size_mm}


def validate_job_v2(raw, bed):
    if not isinstance(raw, dict) or raw.get('protocol') != PROTOCOL_V2 or raw.get('board') not in ('M2', 'M3'):
        raise ValueError('Trabajo incompatible. Se requiere una tarjeta M2 o M3 Nano.')
    board = raw['board']
    max_power = None
    if board == 'M3':
        max_power = _numeric(raw.get('maxPower'), 1, 100, 'Potencia máxima del tubo %')
    if raw.get('bed') != bed:
        raise ValueError('El área de trabajo no coincide con la configurada en el conector.')
    operations = raw.get('operations')
    if not isinstance(operations, list) or not 1 <= len(operations) <= MAX_OPERATIONS:
        raise ValueError('El trabajo necesita entre 1 y 12 operaciones activas.')
    cleaned, total_length, total_points = [], 0.0, 0
    for index, op in enumerate(operations):
        label = f'Operación {index + 1}'
        if not isinstance(op, dict):
            raise ValueError(f'{label}: inválida.')
        kind = op.get('type')
        passes = _passes(op.get('passes'), label)
        name = str(op.get('name') or label)[:60]
        extra = {}
        if board == 'M3':
            extra['power'] = _numeric(op.get('power'), 1, 100, f'{label} · potencia %')
        elif op.get('power') is not None:
            raise ValueError('La M2 no controla la potencia por USB: se ajusta en el panel.')
        pause = op.get('pauseBefore', False)
        if type(pause) is not bool:
            raise ValueError(f'{label}: pausa inválida.')
        if pause and index > 0:
            extra['pauseBefore'] = True
        if kind == 'vector':
            speed = _numeric(op.get('speed'), *VECTOR_SPEED, f'{label} · velocidad mm/s')
            paths, length = _vector_paths(op.get('paths'), bed, label)
            total_points += sum(len(p['points']) for p in paths)
            if total_points > 80000:
                raise ValueError('El trabajo excede 80,000 puntos en total.')
            total_length += length * passes
            if total_length > 500000:
                raise ValueError('El recorrido supera el límite de esta versión.')
            cleaned.append({'type': 'vector', 'name': name, 'speed': speed,
                            'passes': passes, 'paths': paths, **extra})
        elif kind == 'raster':
            speed = _numeric(op.get('speed'), *RASTER_SPEED, f'{label} · velocidad mm/s')
            cleaned.append({'type': 'raster', 'name': name, 'speed': speed,
                            'passes': passes, 'raster': _raster(op.get('raster'), bed, label), **extra})
        else:
            raise ValueError(f'{label}: tipo no compatible.')
    job = {'protocol': PROTOCOL_V2, 'board': board, 'bed': dict(bed),
           **({'maxPower': max_power} if board == 'M3' else {}),
           'name': str(raw.get('name', 'Trabajo'))[:80], 'operations': cleaned}
    # Ancla opcional: al enviar operaciones por separado (para cambiar la potencia en
    # el panel entre ellas), todas se colocan respecto a la esquina del trabajo completo.
    anchor = raw.get('anchor')
    if anchor is not None:
        if not isinstance(anchor, list) or len(anchor) != 2:
            raise ValueError('Ancla de colocación inválida.')
        anchor = [_numeric(anchor[0], 0, bed['width'], 'Ancla X'), _numeric(anchor[1], 0, bed['height'], 'Ancla Y')]
        x0, y0, _, _ = bounds_v2(job)
        if anchor[0] > x0 + 1e-6 or anchor[1] > y0 + 1e-6:
            raise ValueError('El ancla debe estar en la esquina del trabajo completo.')
        job['anchor'] = anchor
    return job


def bounds_v2(job):
    xs, ys = [], []
    for op in job['operations']:
        if op['type'] == 'vector':
            for path in op['paths']:
                for x, y in path['points']:
                    xs.append(x)
                    ys.append(y)
        else:
            r = op['raster']
            xs += [r['x'], r['x'] + r['sizeMm'][0]]
            ys += [r['y'], r['y'] + r['sizeMm'][1]]
    return min(xs), min(ys), max(xs), max(ys)


def place_v2(job, start, bed):
    """Current origin: the job's upper-left bound goes to the head position."""
    x0, y0, x1, y1 = bounds_v2(job)
    if job.get('anchor'):
        x0, y0 = job['anchor']
    dx, dy = start[0] - x0, start[1] - y0
    if x1 + dx > bed['width'] + 1e-6 or y1 + dy > bed['height'] + 1e-6:
        raise ValueError('El diseño excede la cama desde esta posición. Mueve el cabezal o reduce el diseño.')
    placed = {**job, 'operations': []}
    for op in job['operations']:
        if op['type'] == 'vector':
            paths = [dict(p, points=[[round(x + dx, 6), round(y + dy, 6)] for x, y in p['points']])
                     for p in op['paths']]
            placed['operations'].append(dict(op, paths=paths))
        else:
            raster = dict(op['raster'], x=round(op['raster']['x'] + dx, 6), y=round(op['raster']['y'] + dy, 6))
            placed['operations'].append(dict(op, raster=raster))
    return placed


def summary_v2(job):
    out = []
    for op in job['operations']:
        if op['type'] == 'vector':
            out.append({'type': 'vector', 'name': op['name'], 'paths': len(op['paths']),
                        'speed': op['speed'], 'passes': op['passes']})
        else:
            r = op['raster']
            out.append({'type': 'raster', 'name': op['name'], 'rows': r['height'],
                        'speed': op['speed'], 'passes': op['passes'],
                        'stepMm': round(r['step'] * NATIVE_MM, 4)})
    return out


def public_copy(job):
    """Job without the decoded image; safe to keep for status replies."""
    result = copy.copy(job)
    result['operations'] = [dict(op, raster={k: v for k, v in op['raster'].items() if k != 'image'})
                            if op['type'] == 'raster' else op for op in job['operations']]
    return result
