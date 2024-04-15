var frameNum = 0;
var lastFrameNum = 0;
var IterPerFrame = 10;
var maxIterFound = false;
var calcCount = 0;

function calcFps()
{
var FPS = frameNum - lastFrameNum;
lastFrameNum = frameNum;

console.log(FPS + ' FPS   ' + IterPerFrame + ' Iterations / frame      ' + FPS*IterPerFrame + ' Iterations / second');

const fpsTarget = 60;

if(!maxIterFound){
if(FPS >= fpsTarget)
IterPerFrame++;
else if(FPS < fpsTarget && calcCount > 5){
IterPerFrame--;
maxIterFound = true;
}
}
calcCount++;
}

var InitDemo = function() {
   const canvas = document.getElementById('canvas');
   const gl = canvas.getContext('webgl2');

    if (!gl) {
        alert('Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera');
    }

    alert('This is my first web gl fluid simulation, and it will be the baseline for the weather simulation I will be building. It is best on a full hd screen in fullscreen mode (F11). There is no user interface yet. You cannot influence the simulation. Feel free to look at the commented source code (F12) ');

    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear')

    
  //  gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);

    // load shaders
    const vertexShader = loadShader(gl.VERTEX_SHADER, "shader.vert");
    const pressureShader = loadShader(gl.FRAGMENT_SHADER, "pressureShader.frag");
    const velocityShader = loadShader(gl.FRAGMENT_SHADER, "velocityShader.frag");
    const advectionShader = loadShader(gl.FRAGMENT_SHADER, "advectionShader.frag");

    const pressureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "pressureDisplayShader.frag");
    const temperatureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "temperatureDisplayShader.frag");

    // create programs
    const pressureProgram = createProgram(vertexShader, pressureShader);
    const velocityProgram = createProgram(vertexShader, velocityShader);
    const advectionProgram = createProgram(vertexShader, advectionShader);

    const pressureDisplayProgram = createProgram(vertexShader, pressureDisplayShader);
    const temperatureDisplayProgram = createProgram(vertexShader, temperatureDisplayShader);


    // square that fills the screen, so fragment shader is run for every pixel
    const quadVertices = 
    [// X, Y,  U, V
	1.0, -1.0, 1.0, 0.0,
   -1.0, -1.0, 0.0, 0.0,
	1.0,  1.0, 1.0, 1.0,
   -1.0,  1.0, 0.0, 1.0 ];

    gl.activeTexture(gl.TEXTURE0);

    var VertexBufferObject = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VertexBufferObject);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);

    var positionAttribLocation = gl.getAttribLocation(pressureDisplayProgram, 'vertPosition');
	var texCoordAttribLocation = gl.getAttribLocation(pressureDisplayProgram, 'vertTexCoord');

	
    gl.vertexAttribPointer(positionAttribLocation, // Attribute location
    2, // Number of elements per attribute
    gl.FLOAT, // Type of elements
    gl.FALSE, 4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    0 // Offset from the beginning of a single vertex to this attribute
    );
    gl.vertexAttribPointer(texCoordAttribLocation, // Attribute location
    2, // Number of elements per attribute
    gl.FLOAT, // Type of elements
    gl.FALSE, 4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
    );

    gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(texCoordAttribLocation);
    


    const pressToVelTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, pressToVelTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  
    const pressToVelFrameBuff = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pressToVelFrameBuff);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pressToVelTexture, 0); // attach the texture as the first color attachment



    const velToAdvecTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, velToAdvecTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  
    const velToAdvecFrameBuff = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, velToAdvecFrameBuff);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, velToAdvecTexture, 0); // attach the texture as the first color attachment



    const advecToPressTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  
    const advecToPressFrameBuff = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, advecToPressFrameBuff);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, advecToPressTexture, 0); // attach the texture as the first color attachment



    // set constant uniforms for all shaders
    gl.useProgram(pressureProgram);
    gl.uniform2f(gl.getUniformLocation(pressureProgram,'resolution'),canvas.width, canvas.height);

    gl.useProgram(velocityProgram);
    gl.uniform2f(gl.getUniformLocation(velocityProgram,'resolution'),canvas.width, canvas.height);

    gl.useProgram(advectionProgram);
    gl.uniform2f(gl.getUniformLocation(advectionProgram,'resolution'),canvas.width, canvas.height);


    
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velToAdvecFrameBuff);
    gl.clear(gl.COLOR_BUFFER_BIT);


    setInterval(calcFps, 1000); // log fps
    requestAnimationFrame(draw);
    
 
    function draw()
    {


    for(var i = 0; i < IterPerFrame; i++){

    // calc advection
    gl.useProgram(advectionProgram);
    gl.bindTexture(gl.TEXTURE_2D, velToAdvecTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, advecToPressFrameBuff);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // calc pressure
    gl.useProgram(pressureProgram);
    gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pressToVelFrameBuff);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // calc velocity
    gl.useProgram(velocityProgram);
    gl.bindTexture(gl.TEXTURE_2D, pressToVelTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, velToAdvecFrameBuff);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    }




    // render to canvas
    gl.useProgram(temperatureDisplayProgram);
  //  gl.useProgram(pressureDisplayProgram);
    gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    

    
        requestAnimationFrame(draw);
        frameNum ++;
    }



    //////////////////////////////////////////////////////// functions:

    function createProgram(vertexShader, fragmentShader) {
        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        var success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            return program;
        }
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
    }
    
    function loadShader(shaderType, fileName) {
        var request = new XMLHttpRequest();
        request.open("GET", fileName, false);
        request.send(null);
        if (request.status === 200) {
            const shader = gl.createShader(shaderType);
            gl.shaderSource(shader, request.responseText);
            gl.compileShader(shader);
    
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                // problem compiling shader
                throw fileName + " COMPILATION " + gl.getShaderInfoLog(shader);
            }
            return shader;
        }
    }
};




