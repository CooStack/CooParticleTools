TOOLS = [
    {
        "id": "index",
        "title": "Tools Home",
        "description": "Unified entry for the rewritten Vue tools.",
        "route": "/",
    },
    {
        "id": "pointsbuilder",
        "title": "PointsBuilder",
        "description": "Node based particle point builder with preview and Kotlin output.",
        "route": "/pointsbuilder",
    },
    {
        "id": "composition",
        "title": "Composition Builder",
        "description": "Particle composition card workspace with builder bindings.",
        "route": "/composition",
    },
    {
        "id": "composition-pointsbuilder",
        "title": "Composition PointsBuilder",
        "description": "Dedicated points builder workspace for composition payloads.",
        "route": "/composition-pointsbuilder",
    },
    {
        "id": "shader-builder",
        "title": "Shader Builder",
        "description": "Renderer shader and post-processing graph editor.",
        "route": "/shader-builder",
    },
    {
        "id": "generator",
        "title": "Generator",
        "description": "Particle emitter parameter generator.",
        "route": "/generator",
    },
    {
        "id": "bezier",
        "title": "Bezier Tool",
        "description": "Curve editor for easing and time-axis interpolation.",
        "route": "/bezier",
    },
]

TEMPLATES = {
    "pointsbuilder": [
        {"id": "ring", "name": "Ring Points", "payload": {"nodes": [{"kind": "circle", "radius": 3, "count": 24}]}},
        {
            "id": "spiral",
            "name": "Spiral Trail",
            "payload": {"nodes": [{"kind": "spiral", "radius": 3, "height": 6, "turns": 4, "count": 80}]},
        },
    ],
    "composition": [
        {
            "id": "burst",
            "name": "Burst Composition",
            "payload": {"cards": [{"name": "Burst", "bindMode": "point", "point": {"x": 0, "y": 0, "z": 0}}]},
        },
        {"id": "orbital", "name": "Orbital Composition", "payload": {"cards": [{"name": "Orbit", "bindMode": "builder"}]}},
    ],
    "shader-builder": [
        {"id": "flat-color", "name": "Flat Color Model", "payload": {"model": {"primitive": "sphere"}}},
        {"id": "blur-stack", "name": "Bloom Stack", "payload": {"post": {"nodeNames": ["Bloom", "ToneMap"]}}},
    ],
    "generator": [
        {"id": "pulse", "name": "Pulse Emitter", "payload": {"count": 24, "speed": 0.3, "spread": 0.25}},
    ],
    "bezier": [
        {"id": "ease-out", "name": "Ease Out", "payload": {"p1": {"x": 0.2, "y": 0.8}, "p2": {"x": 0.3, "y": 1}}},
    ],
}


def list_tools():
    return list(TOOLS)


def list_templates(tool):
    return list(TEMPLATES.get(tool, []))
