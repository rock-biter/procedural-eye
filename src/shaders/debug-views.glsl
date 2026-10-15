// Debug view selector: materials get DEBUG_VIEW from params.debug.view
// (src/debug/debugViews.js keeps the numbering).
#ifndef DEBUG_VIEWS_GLSL
#define DEBUG_VIEWS_GLSL

#define DEBUG_BEAUTY 0
#define DEBUG_REFRACTION_CHECKER 1
#define DEBUG_NORMALS 2
#define DEBUG_FRESNEL 3
#define DEBUG_REFLECTION_ONLY 4
#define DEBUG_REFRACTION_ONLY 5
#define DEBUG_LIMBUS_MASK 6
#define DEBUG_IRIS_CLAY 7
#define DEBUG_IRIS_STEPS 8
#define DEBUG_IRIS_NORMALS 9
#define DEBUG_IRIS_AO 10
#define DEBUG_IRIS_ATLAS 11

#ifndef DEBUG_VIEW
#define DEBUG_VIEW DEBUG_BEAUTY
#endif

#endif
