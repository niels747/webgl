#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;

uniform vec2 texelSize;

uniform vec2 aspectRatios; // sim   canvas
uniform vec3 view; // Xpos  Ypos    Zoom

out vec2 texCoord; // normalized
out vec2 fragCoord; // non normalized fragment coordinate


void main()
{
    fragCoord = vertTexCoord;
    texCoord = vertTexCoord * texelSize; // normalize
    
    vec2 outpos = vertPosition;
     
    outpos.x += view.x;
    outpos.y += view.y * aspectRatios[0];

    outpos *= view[2]; // zoom
    
    outpos.y *= aspectRatios[1] / aspectRatios[0];

    gl_Position = vec4(outpos, 0.0, 1.0);
}