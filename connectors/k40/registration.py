"""Rigid reference fitting in mm. No scaling, shear or camera calibration."""
import math


def register_job(job, registration, session, position):
    if not isinstance(registration, dict) or not session or registration.get('session') != session or position is None:
        raise ValueError('Las referencias no pertenecen a esta sesión USB. Haz Home y regístralas nuevamente.')
    mode, pairs = registration.get('mode'), registration.get('pairs')
    if mode not in ('translation', 'rigid') or not isinstance(pairs, list) or not (2 if mode == 'rigid' else 1) <= len(pairs) <= 8:
        raise ValueError('Cantidad o método de registro inválidos.')
    for pair in pairs:
        if not isinstance(pair, dict):
            raise ValueError('Referencia inválida.')
        for key in ('design', 'machine'):
            point = pair.get(key)
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError('Referencia inválida.')
            for i, limit in enumerate((job['bed']['width'], job['bed']['height'])):
                value = point[i]
                if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= limit:
                    raise ValueError('Referencia fuera de la cama o inválida.')
    n = len(pairs)
    a = [sum(p['design'][i] for p in pairs)/n for i in (0, 1)]
    b = [sum(p['machine'][i] for p in pairs)/n for i in (0, 1)]
    c, s, scale = 1, 0, 1
    if mode == 'rigid':
        dot = cross = source = target = 0
        for p in pairs:
            x, y = [p['design'][i]-a[i] for i in (0, 1)]
            u, v = [p['machine'][i]-b[i] for i in (0, 1)]
            dot += x*u+y*v
            cross += x*v-y*u
            source += x*x+y*y
            target += u*u+v*v
        norm = math.hypot(dot, cross)
        if source < 50 or target < 50 or norm < 1e-9:
            raise ValueError('Separa las referencias al menos 10 mm.')
        c, s, scale = dot/norm, cross/norm, math.sqrt(target/source)
        if abs(scale-1) > .02:
            raise ValueError('La escala medida difiere más del 2%; no se deformará el diseño.')
    tx, ty = b[0]-c*a[0]+s*a[1], b[1]-s*a[0]-c*a[1]
    def transform(point):
        return [round(c*point[0]-s*point[1]+tx, 6), round(s*point[0]+c*point[1]+ty, 6)]
    errors = [math.dist(transform(p['design']), p['machine']) for p in pairs]
    if max(errors) > .5:
        raise ValueError('Error de registro superior a 0.50 mm; corrige las referencias.')
    result = dict(job, paths=[dict(path, points=[transform(p) for p in path['points']]) for path in job['paths']])
    return result
