import passport from "passport";
import crypto    from "crypto";
import { Strategy as GoogleStrategy }        from "passport-google-oauth20";
import { Strategy as GitHubStrategy }        from "passport-github2";
import { Strategy as TwitterStrategy }       from "passport-twitter";
import { Strategy as OpenIDConnectStrategy } from "passport-openidconnect";

import Usuario       from "../models/Usuario.js";
import SocialAccount from "../models/SocialAccount.js";

// ─────────────────────────────────────────────────────────────────
// HELPER: Busca o crea un usuario + registra la cuenta social
// ─────────────────────────────────────────────────────────────────
const findOrCreateSocialUser = async (profileData) => {
    const {
        provider, providerId, nombre, email,
        avatarUrl, profileUrl, displayName,
        accessToken, refreshToken
    } = profileData;

    try {
        let socialAccount = await SocialAccount.findByProvider(provider, providerId);

        if (socialAccount) {
            await socialAccount.update({
                accessToken,
                refreshToken,
                avatarUrl,
                displayName,
                lastUsed: new Date()
            });
            const usuarioExistente = socialAccount.usuario;
            if (!usuarioExistente) {
                throw new Error(`SocialAccount id=${socialAccount.id} no tiene usuario asociado (JOIN fallo)`);
            }
            // ← Necesario para que socialAuthSuccess envíe el correo de seguridad
            usuarioExistente._loginProvider = provider;
            return usuarioExistente;
        }

        let usuario = email
            ? await Usuario.findOne({ where: { email } })
            : null;

        if (!usuario) {
            usuario = await Usuario.create({
                name:      nombre || displayName || "Usuario Social",
                email:     email  || `${provider}_${providerId}@social.bienesraices.mx`,
                password:  null,
                confirmed: true,
                token:     null
            });
        } else if (!usuario.confirmed) {
            usuario.confirmed = true;
            usuario.token = null;
            await usuario.save();
        }

        const [social, created] = await SocialAccount.findOrCreate({
            where: { provider, providerId },
            defaults: {
                usuarioId:    usuario.id,
                provider,
                providerId,
                accessToken,
                refreshToken: refreshToken || null,
                avatarUrl:    avatarUrl    || null,
                profileUrl:   profileUrl   || null,
                displayName:  displayName  || null,
                lastUsed:     new Date()
            }
        });

        if (!created) {
            await social.update({
                accessToken,
                refreshToken: refreshToken || null,
                avatarUrl:    avatarUrl    || null,
                displayName:  displayName  || null,
                lastUsed:     new Date()
            });
        }

        usuario._loginProvider = provider;
        return usuario;

    } catch (error) {
        console.error(`[${provider?.toUpperCase() ?? "SOCIAL"}] ERROR en findOrCreateSocialUser:`, error.message);
        throw error;
    }
};

// ─────────────────────────────────────────────────────────────────
// STATE STORE BASADO EN Map() — LinkedIn (OpenID Connect)
// ─────────────────────────────────────────────────────────────────
class ServerSideStateStore {

    constructor() {
        this._store = new Map();
        setInterval(() => this._cleanup(), 5 * 60 * 1000).unref();
    }

    _cleanup() {
        const now = Date.now();
        for (const [handle, entry] of this._store.entries()) {
            if (now > entry.expiresAt) this._store.delete(handle);
        }
    }

    store(req, ctx, meta, callback) {
        const args      = Array.from(arguments);
        const cb        = args.find(a => typeof a === "function") ?? null;
        const actualCtx = args.slice(1).find(a => typeof a !== "function") ?? {};

        if (!cb) throw new Error("ServerSideStateStore.store: no se encontro callback valido");

        const handle    = crypto.randomBytes(16).toString("hex");
        const expiresAt = Date.now() + 10 * 60 * 1000;

        this._store.set(handle, { ctx: actualCtx, expiresAt });
        cb(null, handle);
    }

    verify(req, handle, callback) {
        const entry = this._store.get(handle);

        if (!entry) {
            return callback(null, false, { message: "Unable to verify authorization request state." });
        }

        if (Date.now() > entry.expiresAt) {
            this._store.delete(handle);
            return callback(null, false, { message: "Authorization request state expired." });
        }

        this._store.delete(handle);
        callback(null, true, entry.ctx);
    }
}

// ─────────────────────────────────────────────────────────────────
// REQUEST TOKEN STORE — Twitter (OAuth 1.0a)
// ─────────────────────────────────────────────────────────────────
class TwitterTokenStore {

    constructor() {
        this._store = new Map();
        setInterval(() => {
            const now = Date.now();
            for (const [token, entry] of this._store.entries()) {
                if (now > entry.expiresAt) this._store.delete(token);
            }
        }, 5 * 60 * 1000).unref();
    }

    set(req, token, tokenSecret, params, callback) {
        this._store.set(token, { tokenSecret, expiresAt: Date.now() + 10 * 60 * 1000 });
        callback(null);
    }

    get(req, token, callback) {
        const entry = this._store.get(token);
        if (!entry)                    return callback(null, null);
        if (Date.now() > entry.expiresAt) { this._store.delete(token); return callback(null, null); }
        callback(null, entry.tokenSecret);
    }

    destroy(req, token, callback) {
        this._store.delete(token);
        callback(null);
    }
}

// ─────────────────────────────────────────────────────────────────
// SERIALIZACION DE SESION
// ─────────────────────────────────────────────────────────────────
passport.serializeUser((usuario, done) => {
    done(null, usuario.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const usuario = await Usuario.findByPk(id, {
            include: [{
                model:  SocialAccount,
                as:     'socialAccounts',
                limit:  1,
                order:  [['last_used', 'DESC']],
                required: false
            }]
        });
        if (!usuario) return done(null, false);
        done(null, usuario);
    } catch (error) {
        console.error("[Passport] deserializeUser ERROR:", error.message);
        done(error, null);
    }
});

// ─────────────────────────────────────────────────────────────────
// ESTRATEGIA: GOOGLE
// ─────────────────────────────────────────────────────────────────
passport.use(new GoogleStrategy(
    {
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL,
        scope:        ["profile", "email"]
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const usuario = await findOrCreateSocialUser({
                provider:     "google",
                providerId:   profile.id,
                nombre:       profile.displayName,
                email:        profile.emails?.[0]?.value || null,
                avatarUrl:    profile.photos?.[0]?.value || null,
                profileUrl:   profile.profileUrl         || null,
                displayName:  profile.displayName,
                accessToken,
                refreshToken: refreshToken || null
            });
            done(null, usuario);
        } catch (error) {
            console.error("[Google] ERROR en callback:", error.message);
            done(error, null);
        }
    }
));

// ─────────────────────────────────────────────────────────────────
// ESTRATEGIA: GITHUB
// ─────────────────────────────────────────────────────────────────
passport.use(new GitHubStrategy(
    {
        clientID:     process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL:  process.env.GITHUB_CALLBACK_URL,
        scope:        ["user:email"]
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email =
                profile.emails?.[0]?.value ||
                profile._json?.email       ||
                null;

            const usuario = await findOrCreateSocialUser({
                provider:     "github",
                providerId:   String(profile.id),
                nombre:       profile.displayName || profile.username,
                email,
                avatarUrl:    profile.photos?.[0]?.value || null,
                profileUrl:   profile.profileUrl || `https://github.com/${profile.username}`,
                displayName:  profile.displayName || profile.username,
                accessToken,
                refreshToken: refreshToken || null
            });
            done(null, usuario);
        } catch (error) {
            console.error("[GitHub] ERROR en callback:", error.message);
            done(error, null);
        }
    }
));

// ─────────────────────────────────────────────────────────────────
// ESTRATEGIA: TWITTER / X  (OAuth 1.0a)
// ─────────────────────────────────────────────────────────────────
passport.use(new TwitterStrategy(
    {
        consumerKey:       process.env.TWITTER_CONSUMER_KEY,
        consumerSecret:    process.env.TWITTER_CONSUMER_SECRET,
        callbackURL:       process.env.TWITTER_CALLBACK_URL,
        includeEmail:      true,
        requestTokenStore: new TwitterTokenStore()
    },
    async (token, tokenSecret, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value || null;

            const usuario = await findOrCreateSocialUser({
                provider:     "twitter",
                providerId:   profile.id,
                nombre:       profile.displayName,
                email,
                avatarUrl:    profile.photos?.[0]?.value?.replace("_normal", "") || null,
                profileUrl:   `https://twitter.com/${profile.username}`,
                displayName:  profile.displayName,
                accessToken:  token,
                refreshToken: tokenSecret
            });
            done(null, usuario);
        } catch (error) {
            console.error("[Twitter] ERROR en callback:", error.message);
            done(error, null);
        }
    }
));

// ─────────────────────────────────────────────────────────────────
// ESTRATEGIA: LINKEDIN (OpenID Connect)
// ─────────────────────────────────────────────────────────────────
passport.use("linkedin", new OpenIDConnectStrategy(
    {
        issuer:            "https://www.linkedin.com/oauth",
        authorizationURL:  "https://www.linkedin.com/oauth/v2/authorization",
        tokenURL:          "https://www.linkedin.com/oauth/v2/accessToken",
        userInfoURL:       "https://api.linkedin.com/v2/userinfo",
        clientID:          process.env.LINKEDIN_CLIENT_ID,
        clientSecret:      process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL:       process.env.LINKEDIN_CALLBACK_URL,
        scope:             ["openid", "profile", "email"],
        passReqToCallback: false,
        clientAuthMethod:  "client_secret_basic",
        store:             new ServerSideStateStore()
    },
    async (issuer, uiProfile, idProfile, context, idToken, accessToken, refreshToken, params, done) => {
        try {
            const profile = uiProfile || idProfile || {};

            if (!profile || Object.keys(profile).length === 0) {
                return done(new Error("No se pudo obtener el perfil de LinkedIn"), null);
            }

            const email =
                profile.emails?.[0]?.value ||
                profile.email              ||
                context?.email             ||
                null;

            const providerId = profile.id || profile.sub;
            if (!providerId) {
                return done(new Error("No se pudo obtener el ID del perfil de LinkedIn"), null);
            }

            const usuario = await findOrCreateSocialUser({
                provider:     "linkedin",
                providerId:   providerId,
                nombre:       profile.displayName || profile.name?.formatted || "Usuario LinkedIn",
                email,
                avatarUrl:    profile.photos?.[0]?.value || null,
                profileUrl:   null,
                displayName:  profile.displayName || null,
                accessToken:  accessToken  || null,
                refreshToken: refreshToken || null
            });

            done(null, usuario);
        } catch (error) {
            console.error("[LinkedIn] ERROR en callback:", error.message);
            done(error, null);
        }
    }
));

export default passport;