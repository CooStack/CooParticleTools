const COMPOSITION_KOTLIN_TARGETS = Object.freeze({
    yarn: Object.freeze({
        id: "yarn",
        vec3Type: "Vec3d",
        worldType: "World",
        vec3Import: "import net.minecraft.util.math.Vec3d",
        worldImport: "import net.minecraft.world.World",
        particleRenderType: "ParticleTextureSheet",
        particleRenderImport: "import net.minecraft.client.particle.ParticleTextureSheet"
    }),
    mojmap: Object.freeze({
        id: "mojmap",
        vec3Type: "Vec3",
        worldType: "Level",
        vec3Import: "import net.minecraft.world.phys.Vec3",
        worldImport: "import net.minecraft.world.level.Level",
        particleRenderType: "ParticleRenderType",
        particleRenderImport: "import net.minecraft.client.particle.ParticleRenderType"
    })
});

export function normalizeCompositionMapping(rawMapping) {
    return String(rawMapping || "").trim().toLowerCase() === "yarn" ? "yarn" : "mojmap";
}

export function getCompositionKotlinTarget(rawMapping) {
    return COMPOSITION_KOTLIN_TARGETS[normalizeCompositionMapping(rawMapping)];
}

export function mapCompositionKotlinType(rawType, rawMapping) {
    const type = String(rawType || "").trim();
    if (type === "Vec3" || type === "Vec3d") {
        return getCompositionKotlinTarget(rawMapping).vec3Type;
    }
    return type;
}

export function rewriteCompositionKotlinExpression(rawExpression, rawMapping) {
    const target = getCompositionKotlinTarget(rawMapping);
    const source = String(rawExpression || "");
    const replacements = new Map([
        ["Vec3", target.vec3Type],
        ["Vec3d", target.vec3Type],
        ["ParticleRenderType", target.particleRenderType],
        ["ParticleTextureSheet", target.particleRenderType]
    ]);
    let output = "";
    let index = 0;

    const copyQuoted = (quote, triple = false) => {
        const start = index;
        index += triple ? 3 : 1;
        while (index < source.length) {
            if (triple && source.startsWith(quote.repeat(3), index)) {
                index += 3;
                break;
            }
            if (!triple && source[index] === "\\") {
                index += Math.min(2, source.length - index);
                continue;
            }
            if (!triple && source[index] === quote) {
                index += 1;
                break;
            }
            index += 1;
        }
        output += source.slice(start, index);
    };

    while (index < source.length) {
        if (source.startsWith("//", index)) {
            const end = source.indexOf("\n", index);
            if (end < 0) {
                output += source.slice(index);
                break;
            }
            output += source.slice(index, end + 1);
            index = end + 1;
            continue;
        }
        if (source.startsWith("/*", index)) {
            const end = source.indexOf("*/", index + 2);
            const next = end < 0 ? source.length : end + 2;
            output += source.slice(index, next);
            index = next;
            continue;
        }
        if (source.startsWith('"""', index)) {
            copyQuoted('"', true);
            continue;
        }
        if (source[index] === '"' || source[index] === "'" || source[index] === "`") {
            copyQuoted(source[index]);
            continue;
        }
        if (/[A-Za-z_]/.test(source[index])) {
            let end = index + 1;
            while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
            const token = source.slice(index, end);
            output += replacements.get(token) || token;
            index = end;
            continue;
        }
        output += source[index];
        index += 1;
    }

    return output;
}
