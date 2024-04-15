// Universal Functions
float map_range(float value, float min1, float max1, float min2, float max2)
{
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

// Temperature Functions

float potentialToRealT(float potential)
{
return potential - texCoord.y * dryLapse;
}

float realToPotentialT(float real)
{
return real + texCoord.y * dryLapse;
}

float CtoK(float c)
{
    return c + 273.15;
}

float KtoC(float k)
{
    return k - 273.15;
}

float dT_saturated(float dTdry, float dTl) // dTl = temperature difference because of latent heat
{
	if (dTl == 0.0)
		return dTdry;
	else {
		float multiplier = dTdry / (dTdry - dTl);

		return dTdry * multiplier;
	}
}

////////////// Water Functions ///////////////
#define wf_devider 250.0 // 250.0 Real water 	230 less steep curve
#define wf_pow 17.0 // 17.0						10
// https://www.geogebra.org/calculator/jc9hkfq4

float maxWater(float Td)
{
	return pow((Td / wf_devider), wf_pow); // w = ((Td)/(250))^(18) // Td in Kelvin, w in grams per m^3
}

float dewpoint(float W)
{
	if (W < 0.00001)
		return 0.0;
	else
		return wf_devider * pow(W, 1.0 / wf_pow);
}

float relativeHumd(float T, float W)
{
	return (W / maxWater(T));
}



// Color Functions

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}