#version 300 es
precision highp float;

uniform vec2 u_resolution;
in vec2 fragTexCoord;
uniform float time;
uniform sampler2D sampler;
out vec4 fragmentColor;

vec2 circleshape(vec2 position, float radius){

  float len = length(fragTexCoord - position);

  float mag = 0.0028 / (len * len);

if(len > radius)
return (fragTexCoord - position)*mag;// /(1.1 + sin(time));
else
return vec2(9999.9);
}

void main(){
    vec2 position = vec2(0.5 + sin(time)/3.0, 0.5 + cos(time)/3.0); // circular motion

    vec2 circle = circleshape(position, 0.05);

   // vec3 color = vec3(sin(gl_FragCoord.y/10.0)/2.0+1.0, gl_FragCoord.y/1000.0, sin(gl_FragCoord.x/105.0)/2.0+1.0);// + fragColor/2.0;

   vec2 TexCoord = vec2(fragTexCoord.x - circle.x, fragTexCoord.y - circle.y);

   if(circle.x == 9999.9)
   fragmentColor = vec4(0.0,0.0,0.0,1.0);
else
  fragmentColor = texture(sampler,TexCoord);
}