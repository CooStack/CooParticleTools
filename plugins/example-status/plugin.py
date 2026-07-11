def register(context):
    @context.route("GET", "/ping")
    def ping(request):
        return {
            "ok": True,
            "plugin": context.plugin_id,
            "query": request.query,
        }
