package com.zapp.swapmanager.data.remote

import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val getJwtToken: () -> String?,
    private val getBearerToken: () -> String?
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()

        // Inject Cloudflare Access JWT header if configured (docs/safety.md "API input")
        getJwtToken()?.takeIf { it.isNotBlank() }?.let { jwt ->
            builder.header("Cf-Access-Jwt-Assertion", jwt)
        }

        // Inject Bearer token header if configured
        getBearerToken()?.takeIf { it.isNotBlank() }?.let { bearer ->
            builder.header("Authorization", "Bearer $bearer")
        }

        return chain.proceed(builder.build())
    }
}
