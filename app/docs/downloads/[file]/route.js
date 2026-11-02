import collectionJson from "@/postman/SSO_Core_2FA.postman_collection.json";
import environmentJson from "@/postman/SSO_Core_Local.postman_environment.json";

export async function GET(request, { params }) {
  const { file } = await params;

  if (file === "collection.json") {
    return new Response(JSON.stringify(collectionJson, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="SSO_Core_2FA.postman_collection.json"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  if (file === "environment.json") {
    return new Response(JSON.stringify(environmentJson, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="SSO_Core_Local.postman_environment.json"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new Response("Not found", { status: 404 });
}
