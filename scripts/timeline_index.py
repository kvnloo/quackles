"""Precompute numeric timeline order and state snapshots; no private projection."""
from datetime import datetime

THEMES = ('day', 'white', 'blue', 'dark', 'night')


def build_index(entries):
    order = sorted(range(len(entries)), key=lambda i: (datetime.fromisoformat(entries[i]['date']).timestamp(), entries[i]['theme'], int(entries[i]['version'][1:])))
    times, states, latest, milestones = [], [], [-1] * len(THEMES), []
    seen = set()
    start = None
    for position, source in enumerate(order):
        row = entries[source]
        times.append(round(datetime.fromisoformat(row['date']).timestamp() * 1000))
        latest[THEMES.index(row['theme'])] = position
        states.extend(latest)
        if row['theme'] == 'blue' and row['version'] == 'v0':
            start = position
            milestones.append(dict(index=position, label='Blue / project v0', kind='origin', basis='Preserved Blue plate; Git committer date'))
        for prefix, label in [('Theme port', 'Theme ports begin'), ('Night v2', 'Night v2 begins')]:
            if row['phase'].startswith(prefix) and prefix not in seen:
                seen.add(prefix)
                milestones.append(dict(index=position, label=label, kind='phase', basis='First preserved artifact in this phase; not a decision timestamp'))
        if row['status'] == 'current':
            milestones.append(dict(index=position, label=row['theme'].title() + ' / review pick', kind='decision', basis='Current review selection, placed at artifact date; approval and decision time not inferred'))
    if start is None:
        raise ValueError('Blue v0 must exist')
    return dict(schema=1, themes=list(THEMES), order=order, times=times, states=states, start=start, milestones=milestones)
