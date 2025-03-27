const axios = require('axios')
const oauthSignature = require('oauth-signature')
const { routes } = require('./routes')
const { isObjEmpty, slugify, new0AuthParameters } = require('./helpers')

let globalAttemptCount = 0;
const maxGlobalAttempts = 3;
const timeout = 5000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetch({ baseUrl, route, api, basicAuth, method = 'GET', params = {} }) {

    const fullUrl = baseUrl + route;
    const authParams = new0AuthParameters(api.key);
    const signature = oauthSignature.generate(method, fullUrl, authParams, api.secret);

    try {
        const response = await axios.get(fullUrl, {
            responseType: 'json',
            params: {
                ...authParams,
                ...params,
                oauth_signature: signature
            },
            auth: basicAuth
        });

        return response.data;
    } catch (err) {
        globalAttemptCount++;
        console.warn(`Gravity Forms fetch attempt ${globalAttemptCount} failed: ${fullUrl}`);
        if (globalAttemptCount >= maxGlobalAttempts) {
            apiErrorHandler(err);
            return false;
        } else {
            await wait(timeout);
            return await fetch({ baseUrl, route, api, basicAuth, method, params });
        }
    }
}


// Get list of all forms from GF
async function getForms(basicAuth, api, baseUrl) {
    reporter.verbose('Fetching form ids');
    return await fetch({
        baseUrl,
        route: routes.wp + routes.gf + routes.forms,
        api,
        basicAuth
    });
}

// Get form fields from GF
async function getFormFields(basicAuth, api, baseUrl, form) {
    reporter.verbose(`Fetching fields for form ${form.id}`);

    const route = `${routes.wp + routes.gf + routes.forms}/${form.id}`;
    const data = await fetch({
        baseUrl,
        route,
        api,
        basicAuth
    });

    if (!data) return false;

    data['slug'] = slugify(form.title);
    data['apiURL'] = baseUrl + route;
    return data;
}

async function getFormsAndFields(basicAuth, api, baseUrl, formsArgs) {
    let formObj = {}

    // First get forms in list
    let allForms = await getForms(basicAuth, api, baseUrl)

    // If there are forms to move with
    if (allForms) {
        if (!isObjEmpty(allForms)) {
            for (const [key, value] of Object.entries(allForms)) {
                // Clone form object
                let currentForm = { ...allForms[key] }

                let currentFormId = parseInt(currentForm.id)

                // If include is defined with form IDs, only include these form IDs.
                if (
                    formsArgs.include &&
                    !formsArgs.include.includes(currentFormId)
                ) {
                    continue
                }

                // If exclude is defined with form IDs, don't include these form IDs.
                if (
                    formsArgs.exclude &&
                    formsArgs.exclude.includes(currentFormId)
                ) {
                    continue
                }

                // remove unneeded key
                delete currentForm.entries

                let form = await getFormFields(
                    basicAuth,
                    api,
                    baseUrl,
                    currentForm
                )

                formObj['form-' + currentForm.id] = form
            }
        } else {
            reporter.error('We could not find any forms. Have you made any?')
        }

        return formObj
    }
    return false
}

function apiErrorHandler(error) {
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        reporter.panicOnBuild(
            'Request was made, but there was an issue',
            new Error(`Error ${error.response.status} from GravityForms API`)
        )

        // log(error.response.data)
        // log(error.response.status)
        // log(error.response.headers)
    } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        reporter.panicOnBuild(
            'Request was made, but no response',
            new Error('No Repsonse from GravityForms API')
        )
        // log(error.request)
    } else {
        // Something happened in setting up the request that triggered an Error
        reporter.panicOnBuild(
            'Something happened setting up the request',
            new Error('Unsure of GravityForms API Error')
        )
        // log('Error', error)
    }
}

module.exports = {
    getFormsAndFields,
}
